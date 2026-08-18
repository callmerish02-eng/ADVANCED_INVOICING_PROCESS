/**
 * Google Drive integration for invoice file uploads.
 *
 * Uploads invoice files to a structured folder hierarchy:
 *   {DRIVE_ROOT_FOLDER_ID}/FY{YYYY-YY}/{Mon}/{filename}
 *
 * e.g. 1Kpng5Tm6mYA36UkReu7ANtd9026Vh6ph/FY2026-27/Jul/Medicare_BMW_Invoice.pdf
 *
 * The DRIVE_ROOT_FOLDER_ID must be shared with the service account email
 * (the same one used for Google Sheets — same JSON key file works for both).
 *
 * Folders are created on-demand using drive.files.list with q filter to
 * find existing folders by name + parent. We cache folder IDs in memory
 * for the lifetime of the function instance to avoid repeated list calls.
 */
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

const ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID;
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

let cachedClient: drive_v3.Drive | null = null;
// Cache: parentFolderId + name → childFolderId
const folderCache = new Map<string, string>();

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function getServiceAccount(): ServiceAccount {
  if (!SA_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set.');
  }
  try {
    const sa = JSON.parse(SA_JSON) as Partial<ServiceAccount>;
    if (!sa.client_email || !sa.private_key) {
      throw new Error('missing client_email or private_key');
    }
    return sa as ServiceAccount;
  } catch (err) {
    console.error('[drive] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON:', err);
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON');
  }
}

async function getDriveClient(): Promise<drive_v3.Drive> {
  if (cachedClient) return cachedClient;
  const sa = getServiceAccount();

  const jwtClient = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });

  await jwtClient.authorize();
  cachedClient = google.drive({ version: 'v3', auth: jwtClient });
  return cachedClient;
}

/**
 * Find an existing folder by name inside a parent folder, or create it.
 * Folder IDs are cached for the lifetime of the process to avoid
 * repeated API calls for the same FY/Month folders.
 */
async function findOrCreateFolder(
  parentId: string,
  name: string,
): Promise<string> {
  const cacheKey = `${parentId}/${name}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  const drive = await getDriveClient();

  // Search for an existing folder with this name inside the parent.
  // Drive's q query uses 'mimeType' = 'application/vnd.google-apps.folder'
  // to identify folders.
  const listResp = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
  });

  if (listResp.data.files && listResp.data.files.length > 0) {
    const id = listResp.data.files[0].id!;
    folderCache.set(cacheKey, id);
    return id;
  }

  // Not found — create it
  const createResp = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  const id = createResp.data.id!;
  folderCache.set(cacheKey, id);
  return id;
}

interface UploadArgs {
  fy: string; // e.g. "2026-27"
  month: string; // e.g. "Jul"
  filename: string;
  mimeType: string;
  base64Data: string; // base64-encoded file content (no data: prefix)
}

interface UploadResult {
  fileId: string;
  fileUrl: string;
  folderPath: string;
}

/**
 * Upload an invoice file to:
 *   {DRIVE_ROOT}/FY{fy}/{month}/{filename}
 *
 * Creates the FY and Month folders on demand. Returns the file's
 * web view URL.
 */
export async function uploadInvoiceToFolder(args: UploadArgs): Promise<UploadResult> {
  if (!ROOT_FOLDER_ID) {
    throw new Error('DRIVE_ROOT_FOLDER_ID is not set in env.');
  }
  if (!args.filename || !args.base64Data) {
    throw new Error('filename and base64Data are required.');
  }

  const drive = await getDriveClient();

  // 1. Find or create the FY folder (e.g. "FY2026-27") inside the root
  const fyFolderName = `FY${args.fy}`;
  const fyFolderId = await findOrCreateFolder(ROOT_FOLDER_ID, fyFolderName);

  // 2. Find or create the Month folder (e.g. "Jul") inside the FY folder
  const monthFolderId = await findOrCreateFolder(fyFolderId, args.month);

  // 3. Upload the file inside the Month folder.
  // Convert base64 to a Node.js Readable stream. The googleapis SDK
  // expects media.body to be a stream (something with .pipe()), not a
  // raw Buffer — passing a Buffer directly throws "t.body.pipe is not a function".
  const buffer = Buffer.from(args.base64Data, 'base64');
  const stream = Readable.from(buffer);

  // Check if a file with the same name already exists in the month folder.
  // If so, we OVERWRITE it (so re-uploads don't create duplicates).
  const existingList = await drive.files.list({
    q: `'${monthFolderId}' in parents and name = '${args.filename.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
  });

  let fileId: string;
  if (existingList.data.files && existingList.data.files.length > 0) {
    // Overwrite existing file's content (preserves the ID and any comments)
    fileId = existingList.data.files[0].id!;
    await drive.files.update({
      fileId,
      media: {
        mimeType: args.mimeType,
        body: stream,
      },
      fields: 'id',
    });
  } else {
    // Create new file
    const createResp = await drive.files.create({
      requestBody: {
        name: args.filename,
        parents: [monthFolderId],
      },
      media: {
        mimeType: args.mimeType,
        body: stream,
      },
      fields: 'id',
    });
    fileId = createResp.data.id!;
  }

  // 4. Make the file readable by anyone with the link (optional — comment out
  //    if you want files to be visible only to the service account + shared users)
  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  } catch (err) {
    // Don't fail the upload if permission setting fails — the file is still
    // accessible to the service account and anyone the folder is shared with.
    console.warn('[drive] Failed to set anyone-with-link permission:', err);
  }

  return {
    fileId,
    fileUrl: `https://drive.google.com/file/d/${fileId}/view`,
    folderPath: `${fyFolderName}/${args.month}`,
  };
}

export const DRIVE_ENABLED = !!ROOT_FOLDER_ID && !!SA_JSON;

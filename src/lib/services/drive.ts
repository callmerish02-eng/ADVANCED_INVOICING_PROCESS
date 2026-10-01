import { google } from 'googleapis';
import { Readable } from 'stream';
import { getAuthorizedClient } from './sheets-service-account';

export async function getOrCreateFolder(
  drive: any,
  folderName: string,
  parentFolderId: string
): Promise<string> {
  const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${parentFolderId}' in parents and trashed = false`;
  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentFolderId],
  };

  const folder = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
    supportsAllDrives: true,
  });

  return folder.data.id;
}

export async function uploadInvoiceToFolder(params: {
  fy: string;
  month: string;
  filename: string;
  mimeType: string;
  base64Data: string;
}): Promise<{ fileId: string; fileUrl: string }> {
  const rootId = process.env.DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootId) {
    throw new Error('Google Drive Root Folder ID is not configured (check DRIVE_ROOT_FOLDER_ID).');
  }

  const auth = await getAuthorizedClient();
  const drive = google.drive({ version: 'v3', auth });

  // 1. Get or create FY folder (e.g. FY2026-27)
  const fyFolderName = params.fy.startsWith('FY') ? params.fy : `FY${params.fy}`;
  const fyFolderId = await getOrCreateFolder(drive, fyFolderName, rootId);

  // 2. Get or create Month folder (e.g. Nov)
  const monthFolderId = await getOrCreateFolder(drive, params.month, fyFolderId);

  // 3. Upload file
  const buffer = Buffer.from(params.base64Data, 'base64');
  const media = {
    mimeType: params.mimeType || 'application/pdf',
    body: Readable.from(buffer),
  };

  const uploadRes = await drive.files.create({
    requestBody: {
      name: params.filename,
      parents: [monthFolderId],
    },
    media,
    fields: 'id, name, webViewLink, webContentLink',
    supportsAllDrives: true,
  });

  const fileId = uploadRes.data.id!;
  const fileUrl = uploadRes.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

  // Make readable by anyone with the link (fail gracefully if organizational policy prevents public link sharing)
  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
    });
  } catch (permErr) {
    console.warn(`[drive] Public link permission skipped for ${params.filename}:`, permErr);
  }

  return { fileId, fileUrl };
}

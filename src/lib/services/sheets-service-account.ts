/**
 * Shared Google Service Account helper.
 *
 * Used by both the Sheets service and the duplicate-check endpoint so we
 * don't duplicate the JSON parsing + JWT auth logic.
 */
import { google } from 'googleapis';

interface ServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

export function getServiceAccount(): ServiceAccount {
  if (!SA_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(SA_JSON);
  } catch (err) {
    console.error('[sheets-sa] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON:', err);
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON — make sure to paste the entire minified service account key file.');
  }

  const sa = parsed as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key) {
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_JSON is missing required fields. ` +
        `Found: ${sa.client_email ? 'client_email OK' : 'client_email MISSING'}, ` +
        `${sa.private_key ? 'private_key OK' : 'private_key MISSING'}. ` +
        `Make sure you downloaded a SERVICE ACCOUNT KEY JSON (not an API key, not an OAuth client ID).`,
    );
  }

  if (sa.private_key.length < 100 || !sa.private_key.includes('PRIVATE KEY')) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON.private_key does not look like a valid PEM key. ' +
        'You may have pasted an API key instead of a service account key JSON.',
    );
  }

  return sa as ServiceAccount;
}

/**
 * Build an authorized JWT client with the requested scopes.
 * The same service account key works for both Sheets and Drive — just pass
 * the right scopes.
 */
export async function getAuthorizedClient(
  scopes: string[] = ['https://www.googleapis.com/auth/spreadsheets'],
) {
  const sa = getServiceAccount();
  const jwtClient = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes,
  });
  await jwtClient.authorize();
  return jwtClient;
}

export const SA_CONFIGURED = !!SA_JSON;

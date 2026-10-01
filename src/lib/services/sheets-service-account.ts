import { google } from 'googleapis';

export async function getAuthorizedClient() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured in environment variables.');
  }

  let credentials;
  try {
    credentials = JSON.parse(saJson);
  } catch (err) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });

  return auth;
}

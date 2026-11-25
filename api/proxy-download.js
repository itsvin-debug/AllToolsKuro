import proxyDownloadHandler from '../server/handlers/proxyDownloadHandler.js';

export const config = {
  api: {
    bodyParser: true,
    responseLimit: false
  }
};

export default async function handler(req, res) {
  return proxyDownloadHandler(req, res);
}

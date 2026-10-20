import html from "../../docs/previews/liff-commerce.html";
import qr from "../../docs/previews/MOCK-STAGING-LIFF-commerce-QR.svg";
import { createMockCommerceStagingWorker } from "./handler.js";

export default createMockCommerceStagingWorker(html, qr);

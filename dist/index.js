"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const dotenv_1 = __importDefault(require("dotenv"));
const hostinger_1 = require("./webhook/hostinger");
// Load variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
// Multer memory storage configuration to intercept file attachments
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Express route for simulated Hostinger Webhook Endpoint
// Expects optional files uploaded under 'attachments' key
app.post('/webhook/hostinger', upload.array('attachments'), hostinger_1.hostingerWebhookHandler);
// Simple health endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});
app.listen(port, () => {
    console.log(`Server is running locally at http://localhost:${port}`);
    console.log(`Webhook endpoint ready for simulation: POST http://localhost:${port}/webhook/hostinger`);
});

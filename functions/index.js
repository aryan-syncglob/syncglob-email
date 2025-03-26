import express from "express";
import nodemailer from "nodemailer";
import axios from "axios";
import cors from "cors";
import { onRequest } from "firebase-functions/v2/https";
import Joi from "joi";
import crypto from "crypto";

const app = express();
const SECRET_KEY = crypto.randomBytes(32); // 32-byte secret key
const IV = crypto.randomBytes(16);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const transporter = nodemailer.createTransport({
  host: "smtp.ethereal.email",
  port: 587,
  auth: {
    user: "kaia.feil@ethereal.email",
    pass: "kd8JsAf6WuGgT7mYUh",
  },
});

async function verifyRecaptcha(token) {
  const secretKey = "6LeVgkYqAAAAAG1k1hky0x5tF2GTXz4II4IzDLsu";
  const verificationUrl = "https://www.google.com/recaptcha/api/siteverify";

  try {
    const response = await axios.post(verificationUrl, null, {
      params: {
        secret: secretKey,
        response: token,
      },
    });
    return response.data.success;
  } catch (error) {
    console.error("Error verifying reCAPTCHA:", error);
    return false;
  }
}

app.post("/contact", async (req, res) => {
  const { name, emailFrom, message, recaptchaToken } = req.body;

  if (!name || !emailFrom || !message || !recaptchaToken) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
  if (!isRecaptchaValid) {
    return res.status(400).json({ message: "Please re-verify captha" });
  }

  const mailOptions = {
    from: emailFrom,
    to: `hr@syncglob.com`,
    subject: `New Contact Form Submission from ${name}`,
    text: `
        Name: ${name}
        Email: ${emailFrom}
        Message: ${message}
      `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
      console.error("Error sending email info:", info);
      return res.status(500).json({ message: "Failed to send email" });
    }
    res.json({ message: "Email sent successfully!" });
  });
});

const dynamicLinkSchema = Joi.object({
  domainUriPrefix: Joi.string().required(),
  link: Joi.string().uri().required(),
  androidInfo: Joi.object({
    androidPackageName: Joi.string().required(),
  }).optional(),
  iosInfo: Joi.object({
    iosBundleId: Joi.string().required(),
    appStoreId: Joi.string().required(),
  }).optional(),
  payload: Joi.object({
    data: {
      id: Joi.string(),
      type: Joi.string()
    },
    title: Joi.string(),
    description: Joi.string(),
    imageUrl: Joi.string(),
  }).optional(),
});

// Function to encrypt data
function encryptData(data) {
  const cipher = crypto.createCipheriv("aes-256-cbc", SECRET_KEY, IV);
  let encrypted = cipher.update(JSON.stringify(data), "utf8", "base64");
  encrypted += cipher.final("base64");

  // Replace dots with underscores for WhatsApp compatibility
  return encrypted.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Function to decrypt data
function decryptData(encryptedData) {
  try {
    const decipher = crypto.createDecipheriv("aes-256-cbc", SECRET_KEY, IV);

    // Revert compatibility changes
    const sanitizedData = encryptedData
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(encryptedData.length + (4 - (encryptedData.length % 4)) % 4, "=");

    let decrypted = decipher.update(sanitizedData, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted);
  } catch (error) {
    throw new Error("Invalid or expired encrypted data");
  }
}

// Function to generate a short link
function generateShortLink(data) {
  // Add expiration date to the data payload (one year from now)
  const expirationDate = new Date();
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);

  const dataWithExpiration = {
    ...data,
    expiration: expirationDate.toISOString(),
  };

  const encryptedData = encryptData(dataWithExpiration);
  return `${process.env.BASE_URL || "https://api-2erkgporwq-uc.a.run.app"}/short?link=${encryptedData}`;
}

// Route: Generate short link
app.post("/generate-short-link", (req, res) => {
  const { data } = req.body;

  const { error, value } = dynamicLinkSchema.validate(data);
  if (error) {
    return res.status(400).json({
      message: "Invalid dynamicLinkInfo format",
      error: error.details.map((detail) => detail.message),
    });
  }

  const shortLink = generateShortLink(value);
  return res.json({ shortLink });
});

// Route: Handle short link redirects
app.get("/short", (req, res) => {
  const encryptedData = req.query.link;

  if (!encryptedData) {
    return res.status(400).send("Invalid or missing short link data");
  }

  try {
    const decoded = decryptData(encryptedData);

    const {
      payload,
      domainUriPrefix,
      link,
      androidInfo,
      iosInfo,
      expiration,
    } = decoded;

    // Check if the link has expired
    const currentDate = new Date();
    const expirationDate = new Date(expiration);
    console.log('expirationDate----------', expirationDate);

    if (currentDate > expirationDate) {
      return res.status(400).send("The link has expired");
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${payload?.title || "Redirecting..."}</title>
        <!-- Open Graph Meta Tags -->
        <meta property="og:title" content="${payload?.title || 'Default Title'}" />
        <meta property="og:description" content="${payload?.description || 'Default Description'}" />
        <meta property="og:image" content="${payload?.imageUrl || 'https://default-image-url.com'}" />
        <meta property="og:url" content="${link}" />
        <meta property="og:type" content="website" />
      </head>
      <body>
        <script>
          const appLink = "${domainUriPrefix}";
          const webLink = "${link}";
          const iosAppStoreLink = "https://apps.apple.com/app/id${iosInfo?.appStoreId}";
          const androidPlayStoreLink = "https://play.google.com/store/apps/details?id=${androidInfo?.androidPackageName}";

          if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            window.location.href = appLink;
            setTimeout(() => {
              window.location.href = iosAppStoreLink;
            }, 2000);
          } else if (/Android/i.test(navigator.userAgent)) {
            window.location.href = appLink;
            setTimeout(() => {
              window.location.href = androidPlayStoreLink;
            }, 2000);
          } else {
            window.location.href = webLink;
          }
        </script>
      </body>
      </html>
    `;

    res.send(htmlContent);
  } catch (error) {
    return res.status(400).send("Invalid or expired link data");
  }
});

export const api = onRequest(app);

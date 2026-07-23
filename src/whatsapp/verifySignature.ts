import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export function verifyWhatsAppSignature(req: RequestWithRawBody, res: Response, next: NextFunction): void {
  const signatureHeader = req.header("x-hub-signature-256");
  if (!signatureHeader || !req.rawBody) {
    res.sendStatus(401);
    return;
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", env.whatsapp.appSecret).update(req.rawBody).digest("hex");

  const receivedBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    res.sendStatus(401);
    return;
  }

  next();
}

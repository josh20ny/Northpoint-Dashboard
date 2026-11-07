import { Storage } from "@google-cloud/storage";
import { AccessError } from "./administration";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: "http://127.0.0.1:1106/token",
    type: "external_account",
    credential_source: {
      url: "http://127.0.0.1:1106/credential",
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});
export const importStorageReady = () => Boolean(process.env.PRIVATE_OBJECT_DIR);
function file(relative: string) {
  const directory = process.env.PRIVATE_OBJECT_DIR;
  if (!directory) throw new AccessError(503, "Private workbook storage is not configured");
  const parts = directory.replace(/^\/+/, "").split("/");
  const bucket = parts.shift()!;
  if (!/^imports\/[a-f0-9-]{36}\.xlsx$/.test(relative))
    throw new AccessError(400, "Invalid workbook reference");
  return storage.bucket(bucket).file([...parts, relative].join("/"));
}
export async function preserveWorkbook(id: string, bytes: Buffer): Promise<string> {
  const objectPath = `imports/${id}.xlsx`;
  try {
    await file(objectPath).save(bytes, {
      resumable: false,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    return objectPath;
  } catch (e) {
    if (e instanceof AccessError) throw e;
    throw new AccessError(503, "Private workbook storage is unavailable; nothing was staged");
  }
}
export async function originalWorkbook(objectPath: string) {
  try {
    const [bytes] = await file(objectPath).download();
    return bytes;
  } catch (e) {
    if (e instanceof AccessError) throw e;
    throw new AccessError(503, "Original workbook is unavailable");
  }
}

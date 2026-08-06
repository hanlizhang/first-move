import * as SecureStore from "expo-secure-store";
import { createChunkedSecureStorage } from "./chunked-secure-storage.ts";

export const secureSessionStorage = createChunkedSecureStorage(SecureStore);

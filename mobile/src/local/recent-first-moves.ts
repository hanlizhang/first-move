import AsyncStorage from "@react-native-async-storage/async-storage";

import { createRecentFirstMoveRepository } from "./recent-first-moves-core.ts";

export * from "./recent-first-moves-core.ts";

export const recentFirstMoveRepository =
  createRecentFirstMoveRepository(AsyncStorage);

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createMobileRepositoryWithStore,
  type AsyncKeyValueStore,
  type MobileRepository,
} from "./repository-core.ts";

export * from "./repository-core.ts";

export function createMobileRepository(
  store: AsyncKeyValueStore = AsyncStorage,
): MobileRepository {
  return createMobileRepositoryWithStore(store);
}

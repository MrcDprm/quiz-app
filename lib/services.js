// Canlıdaki gerçek bağımlılıklar. Depo ve anahtar ilk istekte oluşturulur;
// ayar eksikse hata endpoint içinde yakalanır ve kullanıcı sade bir mesaj görür.
import { createApi } from './api.js';
import { createCatalog, readGeneratedFiles, readTopicFile } from './catalog.js';
import { createStore } from './store.js';
import { parseKey } from './token.js';
import { createPool } from './ai/pool.js';

let store;
let key;

export const getStore = () => (store ??= createStore());
export const aiPool = createPool(getStore);

export const api = createApi({
  catalog: createCatalog(readTopicFile, readGeneratedFiles, aiPool),
  getStore,
  getKey: () => (key ??= parseKey(process.env.QUIZ_TOKEN_KEY)),
  aiPool,
});
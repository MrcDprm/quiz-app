// Canlıdaki gerçek bağımlılıklar. Depo ve anahtar ilk istekte oluşturulur;
// ayar eksikse hata endpoint içinde yakalanır ve kullanıcı sade bir mesaj görür.
import { createApi } from './api.js';
import { createCatalog } from './catalog.js';
import { createStore } from './store.js';
import { parseKey } from './token.js';

let store;
let key;

export const api = createApi({
  catalog: createCatalog(),
  getStore: () => (store ??= createStore()),
  getKey: () => (key ??= parseKey(process.env.QUIZ_TOKEN_KEY)),
});
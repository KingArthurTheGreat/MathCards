import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from '../shared/model';
const allowed = new Set([
  'snapshot',
  'saveDeck',
  'openDeck',
  'deleteDeck',
  'saveCard',
  'deleteCards',
  'duplicateCard',
  'moveCards',
  'saveCollection',
  'deleteCollection',
  'startSession',
  'rateCard',
  'endSession',
  'settings',
  'demo',
  'addImage',
  'export',
  'import',
]);
const bridge: Bridge = {
  invoke: async (command, payload) => {
    if (!allowed.has(command)) throw new Error('Недоступная операция');
    const response = await ipcRenderer.invoke('mathcards', command, payload);
    if (!response.ok) throw new Error(response.error);
    return response.value;
  },
};
contextBridge.exposeInMainWorld('mathcards', bridge);

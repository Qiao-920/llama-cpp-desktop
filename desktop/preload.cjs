const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('llamaDesktop', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('llama:get-state'),
  saveConfig: payload => ipcRenderer.invoke('llama:save-config', payload),
  startServer: payload => ipcRenderer.invoke('llama:start-server', payload),
  stopServer: () => ipcRenderer.invoke('llama:stop-server'),
  testHealth: payload => ipcRenderer.invoke('llama:test-health', payload),
  chatCompletion: payload => ipcRenderer.invoke('llama:chat-completion', payload),
  streamChat: payload => ipcRenderer.invoke('llama:chat-stream', payload),
  getModelInfo: payload => ipcRenderer.invoke('llama:get-model-info', payload),
  pickFile: options => ipcRenderer.invoke('llama:pick-file', options?.properties ? options : { filters: options }),
  pickAttachments: payload => ipcRenderer.invoke('llama:pick-attachments', payload),
  revealPath: filePath => ipcRenderer.invoke('llama:reveal-path', { filePath }),
  openUrl: url => ipcRenderer.invoke('llama:open-url', { url }),
  onEvent: callback => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('llama:event', handler)
    return () => ipcRenderer.removeListener('llama:event', handler)
  },
})

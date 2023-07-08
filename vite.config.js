import path from 'path'

export default {
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        subhappy: path.resolve(__dirname, 'subindex/subhappy.html'),
        subwary: path.resolve(__dirname, 'subindex/subwary.html'),
        subbad: path.resolve(__dirname, 'subindex/subbad.html'),
        discord: path.resolve(__dirname, 'subindex/discordhook.html')
      }
    }
  }
}
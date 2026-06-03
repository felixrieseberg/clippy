# Clippy's Revenge

**Clippy's Revenge** is a parody desktop pet. The late, great Clippy — the assistant from Microsoft Office 1997 — has been fired, fallen on hard times, and had a few too many drinks. Now he's crawled back onto your desktop, where he proactively pops up to slur, burp, and heckle you about whatever you happen to be doing. He runs a Large Language Model **locally** on your machine (via llama.cpp / GGUF models), so all of his bitterness is generated offline.

> ⚠️ **Disclaimer:** This app is an unofficial parody. It is **not** affiliated with, approved by, endorsed by, or supported by Microsoft. Clippy and all visual assets related to Clippy are owned by Microsoft. Consider this software art; if you don't like it, consider it software satire.

## Credits

Clippy's Revenge is a parody fork of the original **[Clippy](https://github.com/felixrieseberg/clippy)** app by **[Felix Rieseberg](https://github.com/felixrieseberg)** (MIT licensed) — a faithful, lovingly-built local-LLM homage to the original assistant. Clippy's Revenge keeps his foundation and twists the personality into a washed-up drunk. Huge thanks to Felix; none of this exists without his work.

The original Clippy character was designed by illustrator [Kevan Atteberry](https://www.kevanatteberry.com/). Built with [Electron](https://electronjs.org/), [node-llama-cpp](https://node-llama-cpp.withcat.ai/), and [@electron/llm](https://github.com/electron/llm); quantized GGUF models provided by [Unsloth](https://www.unsloth.ai). The whimsical retro design comes from [Jordan Scales](https://github.com/jdan).

## Features

- **Proactive, contextual heckling.** Clippy watches what app you're using and pipes up every 45s–2min with a slurred, bitter, often inappropriate comment about it (or just rambles about getting laid off).
- **Runs entirely locally.** Powered by llama.cpp / `node-llama-cpp`, which automatically finds the most efficient way to run your model (Metal, CUDA, Vulkan, etc). Defaults to Meta's Llama 3.2 3B; Gemma 3, Phi-4, and Qwen3 are also one-click.
- **Desktop pet, not a window.** Lives bottom-right, never steals focus (macOS accessory mode), with a "Sober Mode" to shut him up and a toggle for his notification chime.
- **Offline, local, free:** Everything runs on your computer. The only network request is the optional update check.

## Non-Features

Countless little chat apps for local LLMs exist out there. Many of them are likely better - and that's okay. This project isn't trying to be your best chat bot. I'd like you to enjoy a weird mix of nostalgia for 1990s technology paired with one the most magical technologies we can run on our computers in 2025.

## Downloading More Models

Clippy supports (thanks to Llama.cpp) most GGUF models. You can find GGUF models in plenty of online sources - I tend to go with models quantized by [TheBloke](https://huggingface.co/thebloke) or [Unsloth](https://huggingface.co/unsloth).

## Acknowledgements

Thanks to:

- I am so grateful to Microsoft - not only for everything they've done for Electron, but also for giving us one of the most iconic characters and designs of computing history.
- [Kevan Atteberry](https://www.kevanatteberry.com/) for Clippy
- [Jordan Scales (@jdan)](https://github.com/jdan) for the Windows 98 design
- [Pooya Parsa (@pi0)](https://github.com/pi0) for being the (as far as I know) person to extract the length of each frame from the Clippy spritesheet.
- [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) for squeezing llama.cpp into Node.js

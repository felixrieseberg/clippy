# Clippy

[Clippy](https://felixrieseberg.github.io/clippy/) lets you run a variety of large language models (LLMs) locally on your computer while sticking with a user interface of the 1990s. Through Llama.cpp, it supports models in the popular GGUF format, which is to say most publicly available models. It comes with one-click installation support for Google's Gemma3, Meta's Llama 3.2, Microsoft's Phi-4, and Qwen's Qwen3.

It's a love letter and homage to the late, great Clippy, the assistant from Microsoft Office 1997. The character was designed by illustrator Kevan Atteberry, who created more than 15 potential characters for Microsoft's Office Assistants. This app is not affiliated, approved, or supported by Microsoft. Consider it software art. If you don't like it, consider it software satire.

It is also meant to be a reference implementation of [@electron/llm](https://github.com/electron/llm), hoping to help other developers of Electron apps make use of local language models.

---

## ✨ What's New in This Fork

This fork modernises Clippy with cloud API support, a premium UI, and a fully overhauled animation engine.

### 🌐 Cloud API Support
- **OpenRouter** — Connect to hundreds of free and paid models (GPT-4o, Claude, Llama, Nemotron, etc.) via a single API key.
- **xAI (Grok)** — Native support for xAI's Grok models.
- Provider is selectable in Settings alongside the existing local model option.

### 💎 Modern Glassmorphism UI
- Redesigned floating chat bubble with glassmorphism styling (blur, transparency, gradients).
- Screen-edge-aware popup positioning — the bubble never clips off screen.
- Smooth micro-animations and hover effects throughout.
- Inline mini-settings panel inside the chat bubble for quick access.
- Full Settings window accessible via Ctrl+Click on Clippy.

### 🎭 Smart Animation Engine
- **Processing animation** plays while the AI is thinking.
- **Sentiment-based animation selection** — Clippy automatically picks a contextually appropriate animation based on what you type, covering 18 categories:

  | Your message contains | Clippy plays |
  |---|---|
  | "hi", "hello", "hey" | Wave |
  | "bye", "goodbye" | GoodBye |
  | "search", "find", "look up" | Searching |
  | "code", "function", "javascript" | GetTechy |
  | "error", "bug", "problem" | Alert |
  | "write", "draft", "compose" | Writing |
  | "email", "send", "deliver" | SendMail |
  | "art", "design", "creative" | GetArtsy |
  | "magic", "wizard" | GetWizardy |
  | "print", "output", "display" | Print |
  | ... and more | ... |

- **AI-tag override** — If the cloud model outputs an animation tag (e.g. `[Wave]`), that takes priority over the sentiment pick.
- **Idle animation loop** — When Clippy is idle, he cycles through random idle animations (blinking, scratching his head, snoozing, etc.) every 6 seconds.
- Animations use a dual-timer architecture to prevent the idle loop from being killed by other animation events.

---

## Features

- Simple, familiar, and classic chat interface. Send messages to your models, get a response.
- Batteries included: No complicated setup. Just open the app and chat away. Thanks to llama.cpp and `node-llama-cpp`, the app will automatically discover the most efficient way to run your models (Metal, CUDA, Vulkan, etc).
- Custom models, prompts, and parameters: Load your own downloaded models and play with the settings.
- **Cloud models** via OpenRouter and xAI in addition to local models.
- Offline, local, free for local models. Cloud models require an API key.

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

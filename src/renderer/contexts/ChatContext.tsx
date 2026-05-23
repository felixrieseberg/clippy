import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
} from "react";
import { Message } from "../components/Message";
import { clippyApi, electronAi } from "../clippyApi";
import { SharedStateContext } from "./SharedStateContext";
import { areAnyModelsReadyOrDownloading } from "../../helpers/model-helpers";
import { WelcomeMessageContent } from "../components/WelcomeMessageContent";
import { ChatRecord, MessageRecord } from "../../types/interfaces";
import { useDebugState } from "./DebugContext";
import { ANIMATION_KEYS_BRACKETS } from "../clippy-animation-helpers";
import { ErrorLoadModelMessageContent } from "../components/ErrorLoadModelMessageContent";

import type {
  LanguageModelPrompt,
  LanguageModelCreateOptions,
  LanguageModelPromptRole,
  LanguageModelPromptType,
} from "@electron/llm";

type ClippyNamedStatus =
  | "welcome"
  | "idle"
  | "responding"
  | "thinking"
  | "goodbye";

export type ChatContextType = {
  messages: Message[];
  addMessage: (message: Message) => Promise<void>;
  setMessages: (messages: Message[]) => void;
  animationKey: string;
  setAnimationKey: (animationKey: string) => void;
  status: ClippyNamedStatus;
  setStatus: (status: ClippyNamedStatus) => void;
  isModelLoaded: boolean;
  isChatWindowOpen: boolean;
  setIsChatWindowOpen: (isChatWindowOpen: boolean) => void;
  chatRecords: Record<string, ChatRecord>;
  currentChatRecord: ChatRecord;
  selectChat: (chatId: string) => void;
  startNewChat: () => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  deleteAllChats: () => Promise<void>;
};

export const ChatContext = createContext<ChatContextType | undefined>(
  undefined,
);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChatRecord, setCurrentChatRecord] = useState<ChatRecord>({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    preview: "",
  });
  const [chatRecords, setChatRecords] = useState<Record<string, ChatRecord>>(
    {},
  );
  const [animationKey, setAnimationKey] = useState<string>("");
  const [status, setStatus] = useState<ClippyNamedStatus>("welcome");
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const { settings, models } = useContext(SharedStateContext);
  const debug = useDebugState();
  const [isChatWindowOpen, setIsChatWindowOpen] = useState(false);
  const [hasPerformedStartupCheck, setHasPerformedStartupCheck] =
    useState(false);

  const getSystemPrompt = useCallback(() => {
    return settings.systemPrompt.replace(
      "[LIST OF ANIMATIONS]",
      ANIMATION_KEYS_BRACKETS.join(", "),
    );
  }, [settings.systemPrompt]);

  const addMessage = useCallback(
    async (message: Message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    },
    [currentChatRecord, messages],
  );

  const selectChat = useCallback(
    async (chatId: string) => {
      try {
        const chatWithMessages = await clippyApi.getChatWithMessages(chatId);

        if (chatWithMessages) {
          setMessages(chatWithMessages.messages);
          setCurrentChatRecord(chatWithMessages.chat);
        }

        await loadModel(
          messagesToInitialPrompts(chatWithMessages?.messages || []),
        );
      } catch (error) {
        console.error(error);
      }
    },
    [currentChatRecord, messages],
  );

  const startNewChat = useCallback(async () => {
    // No need if there are no messages, we'll just keep the current chat
    // and update the timestamps
    if (messages.length === 0) {
      setCurrentChatRecord({
        ...currentChatRecord,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return;
    }

    const newChatRecord = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      preview: "",
    };

    setCurrentChatRecord(newChatRecord);
    setChatRecords((prevChatRecords) => ({
      ...prevChatRecords,
      [newChatRecord.id]: newChatRecord,
    }));
    setMessages([]);
  }, [currentChatRecord, messages]);

  const loadModel = useCallback(
    async (initialPrompts: LanguageModelPrompt[] = []) => {
      setIsModelLoaded(false);

      const options: LanguageModelCreateOptions = {
        modelAlias: settings.selectedModel,
        systemPrompt: getSystemPrompt(),
        topK: settings.topK,
        temperature: settings.temperature,
        initialPrompts,
      };

      console.log("Loading model with options:", options);

      try {
        await electronAi.create(options);
        setIsModelLoaded(true);
      } catch (error) {
        console.error(error);

        addMessage({
          id: crypto.randomUUID(),
          children: <ErrorLoadModelMessageContent error={error} />,
          sender: "clippy",
          createdAt: Date.now(),
        });
      }
    },
    [
      settings.selectedModel,
      settings.systemPrompt,
      settings.topK,
      settings.temperature,
      messages,
    ],
  );

  const deleteChat = useCallback(
    async (chatId: string) => {
      await clippyApi.deleteChat(chatId);

      setChatRecords((prevChatRecords) => {
        const newChatRecords = { ...prevChatRecords };
        delete newChatRecords[chatId];
        return newChatRecords;
      });

      if (currentChatRecord.id === chatId) {
        await startNewChat();
      }
    },
    [currentChatRecord.id],
  );

  const deleteAllChats = useCallback(async () => {
    await clippyApi.deleteAllChats();

    setChatRecords({});
    setMessages([]);
    startNewChat();
  }, []);

  // Update the chat record in the database whenever messages change
  useEffect(() => {
    const updatedChatRecord = {
      ...currentChatRecord,
      updatedAt: Date.now(),
      preview: currentChatRecord.preview || getPreviewFromMessages(messages),
    };

    const chatWithMessages = {
      chat: updatedChatRecord,
      messages: messages.map(messageRecordFromMessage),
    };

    setCurrentChatRecord(updatedChatRecord);

    clippyApi.writeChatWithMessages(chatWithMessages).catch((error) => {
      console.error(error);
    });
  }, [messages]);

  // Load the model when the selected model changes
  // or when the system prompt, topK, or temperature change
  useEffect(() => {
    if (debug?.simulateDownload) {
      setIsModelLoaded(true);
      return;
    }

    if (settings.selectedModel) {
      loadModel(messagesToInitialPrompts(messages));
    } else if (!settings.selectedModel && isModelLoaded) {
      electronAi
        .destroy()
        .then(() => {
          setIsModelLoaded(false);
        })
        .catch((error) => {
          console.error(error);
        });
    }
  }, [
    settings.selectedModel,
    settings.systemPrompt,
    settings.topK,
    settings.temperature,
    // Note: Intentionally NOT including 'messages' to avoid reloading on every message
  ]);

  // If selectedModel is undefined or not available, set it to the first downloaded model
  useEffect(() => {
    if (
      !settings.selectedModel ||
      !models[settings.selectedModel] ||
      !models[settings.selectedModel].downloaded
    ) {
      const downloadedModel = Object.values(models).find(
        (model) => model.downloaded,
      );

      if (downloadedModel) {
        clippyApi.setState("settings.selectedModel", downloadedModel.name);
      }
    }
  }, [models]);

  // At app startup, initially load the chat records from the main process
  useEffect(() => {
    clippyApi.getChatRecords().then((chatRecords) => {
      setChatRecords(chatRecords);
    });
  }, []);

  // At app startup, check if any models are ready. If none are, kick off a download
  // for our smallest model and tell the user about it.
  useEffect(() => {
    if (
      messages.length > 0 ||
      Object.keys(models).length === 0 ||
      areAnyModelsReadyOrDownloading(models)
    ) {
      return;
    }

    if (hasPerformedStartupCheck) {
      return;
    }

    setHasPerformedStartupCheck(true);

    addMessage({
      id: crypto.randomUUID(),
      children: <WelcomeMessageContent />,
      content: "Welcome to Clippy!",
      sender: "clippy",
      createdAt: Date.now(),
    });

    const downloadModelIfNoneReady = async () => {
      await clippyApi.downloadModelByName("Gemma 3 (1B)");

      setTimeout(async () => {
        await clippyApi.updateModelState();
      }, 500);
    };

    void downloadModelIfNoneReady();
  }, [models]);

  // Subscribe to the main process's newChat event
  useEffect(() => {
    clippyApi.offNewChat();
    clippyApi.onNewChat(async () => {
      await startNewChat();
    });

    return () => {
      clippyApi.offNewChat();
    };
  }, [startNewChat]);

  const value = {
    chatRecords,
    currentChatRecord,
    selectChat,
    deleteChat,
    deleteAllChats,
    startNewChat,
    messages,
    addMessage,
    setMessages,
    animationKey,
    setAnimationKey,
    status,
    setStatus,
    isModelLoaded,
    isChatWindowOpen,
    setIsChatWindowOpen,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }

  return context;
}

function messageRecordFromMessage(message: Message): MessageRecord {
  return {
    id: message.id,
    content: message.content,
    sender: message.sender,
    createdAt: message.createdAt,
  };
}

function getPreviewFromMessages(messages: Message[]): string {
  if (messages.length === 0) {
    return "";
  }

  if (messages[0].sender === "clippy") {
    return "Welcome to Clippy!";
  }

  // Remove newlines and limit to 100 characters
  return messages[0].content.replace(/\n/g, " ").substring(0, 100);
}

function messagesToInitialPrompts(messages: Message[]): LanguageModelPrompt[] {
  return messages.map((message) => ({
    role:
      message.sender === "clippy"
        ? ("assistant" as LanguageModelPromptRole)
        : ("user" as LanguageModelPromptRole),
    type: "text" as LanguageModelPromptType,
    content: message.content || "",
  }));
}

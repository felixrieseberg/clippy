import { useChat } from "../contexts/ChatContext";
import { TableView } from "./TableView";
import { formatDistance } from "date-fns";
import { clippyApi } from "../clippyApi";
import { useState } from "react";

export type SettingsTab = "general" | "model" | "advanced" | "about";

export type SettingsProps = {
  onClose: () => void;
};

export const Chats: React.FC<SettingsProps> = ({ onClose }) => {
  const {
    chatRecords,
    currentChatRecord,
    selectChat,
    deleteChat,
    deleteAllChats,
  } = useChat();
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedChatIndex, setSelectedChatIndex] = useState<number | null>(
    null,
  );

  const chatsWithPreview = Object.values(chatRecords).map((chat) => ({
    id: chat.id,
    lastUpdated: formatDistance(chat.updatedAt, new Date(), {
      addSuffix: true,
    }),
    preview: chat.preview,
  }));

  const handleSelectChat = async (index: number) => {
    setSelectedChatIndex(index);
  };

  const handleRestoreChat = async () => {
    if (
      selectedChatIndex === null ||
      selectedChatIndex >= chatsWithPreview.length
    ) {
      return;
    }

    selectChat(chatsWithPreview[selectedChatIndex].id);
    onClose();
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!confirm("Are you sure you want to delete this chat?")) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteChat(chatId);
      setSelectedChatIndex(null);
    } catch (error) {
      console.error("Failed to delete chat:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (
      selectedChatIndex === null ||
      selectedChatIndex >= chatsWithPreview.length
    ) {
      return;
    }

    const chatId = chatsWithPreview[selectedChatIndex].id;
    await handleDeleteChat(chatId);
  };

  const handleDeleteAllChats = async () => {
    if (
      !confirm(
        "Are you sure you want to delete ALL chats? This cannot be undone.",
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteAllChats();
      setSelectedChatIndex(null);
    } catch (error) {
      console.error("Failed to delete all chats:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = [
    { key: "preview", header: "Preview" },
    { key: "lastUpdated", header: "Last Updated" },
  ];

  return (
    <div
      className="chats-container"
      style={{
        padding: "16px",
        maxHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1>Chats</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleRestoreChat}
            disabled={selectedChatIndex === null}
          >
            Restore Chat
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={isDeleting || selectedChatIndex === null}
          >
            Delete Selected
          </button>
          <button onClick={handleDeleteAllChats} disabled={isDeleting}>
            Delete All Chats
          </button>
        </div>
      </div>

      <TableView
        columns={columns}
        data={chatsWithPreview}
        onRowSelect={handleSelectChat}
        onRowDoubleClick={handleRestoreChat}
        style={{ height: "calc(80vh - 100px)", overflow: "auto" }}
        initialSelectedIndex={Object.values(chatRecords).findIndex(
          (chat) => chat.id === currentChatRecord.id,
        )}
      />
    </div>
  );
};

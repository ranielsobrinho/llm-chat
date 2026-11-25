import { ArrowUp, Brain, Menu, Moon, Plus, Sparkles, Sun, Trash2 } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  type ConversationSummary,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  streamChatMessage,
} from "./services/chat-api";

type Message = {
  id: number;
  role: "assistant" | "user";
  content: string;
};

const welcomeMessage: Message = {
  id: 0,
  role: "assistant",
  content: "Hi there! I’m your AI assistant. What would you like to explore today?",
};

const suggestions = [
  {
    icon: "✳",
    label: "Explain a concept",
    prompt: "Explain a complex concept in simple terms",
  },
  {
    icon: "⌘",
    label: "Help me write",
    prompt: "Help me write a clear and engaging introduction",
  },
  {
    icon: "⌁",
    label: "Brainstorm ideas",
    prompt: "Help me brainstorm some creative ideas",
  },
  {
    icon: "⌕",
    label: "Learn something new",
    prompt: "Teach me something interesting about space",
  },
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [draft, setDraft] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    window.localStorage.getItem("theme") === "dark" ? "dark" : "light",
  );
  const [isSending, setIsSending] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    listConversations()
      .then((items) => {
        if (active) setConversations(items);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function sendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || isSending) return;

    setDraft("");
    setIsSending(true);

    const userId = nextId.current++;
    const assistantId = nextId.current++;

    setMessages((current) => [
      ...current,
      { id: userId, role: "user", content },
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        const conversation = await createConversation();
        conversationId = conversation.id;
        setActiveConversationId(conversation.id);
        setConversations((current) => [conversation, ...current]);
      }

      await streamChatMessage(conversationId, content, (delta) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content: message.content + delta } : message,
          ),
        );
      });
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, title: content.slice(0, 72), updatedAt: new Date().toISOString() }
            : conversation,
        ),
      );
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: message.content
                  ? `${message.content}\n\nResponse interrupted. Please try again.`
                  : "I couldn't reach the assistant. Please try again.",
              }
            : message,
        ),
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function startNewChat() {
    setMessages([welcomeMessage]);
    setActiveConversationId(null);
    nextId.current = 1;
    setDraft("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  async function openConversation(id: string) {
    if (isSending) return;
    try {
      const conversation = await getConversation(id);
      setActiveConversationId(conversation.id);
      nextId.current = conversation.messages.length + 1;
      setMessages(
        conversation.messages.map((message, index) => ({
          id: index + 1,
          role: message.role,
          content: message.content,
        })),
      );
      setSidebarOpen(false);
    } catch {
      setConversations((current) => current.filter((conversation) => conversation.id !== id));
    }
  }

  async function removeConversation(id: string) {
    if (isSending) return;
    try {
      await deleteConversation(id);
      setConversations((current) => current.filter((conversation) => conversation.id !== id));
      if (activeConversationId === id) startNewChat();
    } catch {
      // Keep the conversation visible so the user can retry.
    }
  }

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    window.localStorage.setItem("theme", nextTheme);
    setTheme(nextTheme);
  }

  const hasUserMessages = messages.some((message) => message.role === "user");

  return (
    <div className={`app-shell flex min-h-screen ${theme === "dark" ? "theme-dark" : ""}`}>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`sidebar flex h-screen w-64 shrink-0 flex-col ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="brand-row">
          <div className="brand-mark">
            <Brain size={18} strokeWidth={2.2} />
          </div>
          <span className="brand-name">RanGPT</span>
          <button
            type="button"
            className="icon-button mobile-menu-close"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            <Menu size={18} />
          </button>
        </div>
        <button
          type="button"
          className="new-chat-button"
          onClick={startNewChat}
          disabled={isSending}
        >
          <Plus size={17} strokeWidth={2} />
          <span>New chat</span>
          <span className="shortcut">⌘ K</span>
        </button>
        <div className="sidebar-section">
          <p className="section-label">YOUR SPACE</p>
          {conversations.length === 0 ? (
            <div className="empty-history">
              <span className="history-glyph">◷</span>
              <span>Your conversations will show up here</span>
            </div>
          ) : (
            <div className="conversation-history">
              {conversations.map((conversation) => (
                <div className="history-item" key={conversation.id}>
                  <button
                    type="button"
                    className={`history-open ${conversation.id === activeConversationId ? "history-active" : ""}`}
                    onClick={() => void openConversation(conversation.id)}
                    title={conversation.title}
                  >
                    {conversation.title}
                  </button>
                  <button
                    type="button"
                    className="history-delete"
                    aria-label={`Delete ${conversation.title}`}
                    onClick={() => void removeConversation(conversation.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="learning-card">
            <div className="learning-icon">
              <Sparkles size={15} />
            </div>
            <div>
              <p className="learning-title">Learning mode</p>
              <p className="learning-copy">Chat is running locally</p>
            </div>
            <span className="status-dot" />
          </div>
          <div className="profile-row">
            <div className="avatar">R</div>
            <div className="profile-copy">
              <span className="profile-name">Your workspace</span>
              <span className="profile-plan">Personal</span>
            </div>
            <button
              type="button"
              className="icon-button profile-more"
              aria-label="Workspace options"
            >
              ···
            </button>
          </div>
        </div>
      </aside>

      <main className="main-panel relative flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="topbar flex h-[62px] shrink-0 items-center border-b px-[35px]">
          <button
            type="button"
            className="icon-button mobile-menu-open"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="model-selector">
            <span className="model-dot" />
            <span>Assistant</span>
            <span className="model-chevron">⌄</span>
          </div>
          <div className="topbar-right">
            <span className="local-label">
              <span className="local-indicator" />
              Local preview
            </span>
            <button
              className="icon-button theme-toggle"
              type="button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              onClick={toggleTheme}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button type="button" className="icon-button topbar-more" aria-label="More options">
              ···
            </button>
          </div>
        </header>

        <section
          className={`conversation ${hasUserMessages ? "conversation-active" : ""}`}
          aria-label="Chat conversation"
        >
          {!hasUserMessages ? (
            <div className="welcome-layout">
              <div className="welcome-orb">
                <span className="orb-core">
                  <Sparkles size={25} strokeWidth={1.6} />
                </span>
                <span className="orb-ring orb-ring-one" />
                <span className="orb-ring orb-ring-two" />
              </div>
              <p className="eyebrow">A LITTLE CURIOSITY GOES A LONG WAY</p>
              <h1>
                Good things start
                <br />
                with a <span>question.</span>
              </h1>
              <p className="welcome-copy">
                A space to think out loud, untangle ideas, and find
                <br className="desktop-break" /> your next “aha” moment.
              </p>
              <div className="suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion.label}
                    className="suggestion-card"
                    onClick={() => {
                      setDraft(suggestion.prompt);
                      inputRef.current?.focus();
                    }}
                  >
                    <span className="suggestion-icon">{suggestion.icon}</span>
                    <span>{suggestion.label}</span>
                    <span className="suggestion-arrow">↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article
                  className={`message-row ${message.role === "user" ? "message-user" : "message-assistant"}`}
                  key={message.id}
                >
                  {message.role === "assistant" ? (
                    <div className="message-avatar">
                      <Sparkles size={15} />
                    </div>
                  ) : null}
                  <div className="message-body">
                    <span className="message-author">
                      {message.role === "assistant" ? "RanGPT" : "You"}
                    </span>
                    <p>{message.content}</p>
                  </div>
                </article>
              ))}
              <div className="local-note">
                <span className="local-indicator" />
                Messages are sent to OpenAI; this app doesn't save chat history.
              </div>
            </div>
          )}
        </section>

        <div className="composer-area">
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              ref={inputRef}
              aria-label="Write a message"
              placeholder="Ask anything..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <div className="composer-footer">
              <span className="composer-hint">
                <kbd>↵</kbd> to send <span className="hint-divider">·</span> <kbd>⇧ ↵</kbd> for new
                line
              </span>
              <button
                className="send-button"
                type="submit"
                aria-label={isSending ? "Waiting for a response" : "Send message"}
                disabled={!draft.trim() || isSending}
              >
                <ArrowUp size={17} strokeWidth={2.3} />
              </button>
            </div>
          </form>
          {isSending && <output className="message-author">RanGPT is thinking</output>}
          <div className="disclaimer">
            RanGPT can make mistakes. Double-check anything important.
          </div>
        </div>
      </main>
    </div>
  );
}

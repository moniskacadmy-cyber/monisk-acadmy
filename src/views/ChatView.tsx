import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, MessageSquare, Plus, Search, Send, Users, X } from 'lucide-react';
import { collection, limitToLast, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import type { AcademyDataState } from '../hooks/useAcademyData';
import { callProtectedApi } from '../lib/apiClient';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ROLE_LABELS } from '../shared/labels';
import type { ConversationDoc, MessageDoc } from '../shared/types';

interface Contact {
  uid: string;
  name: string;
  role: keyof typeof ROLE_LABELS;
}

const MESSAGE_LIMIT = 300;

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'اليوم';
  if (same(d, yesterday)) return 'أمس';
  return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function isDirect(conv: ConversationDoc): boolean {
  return (conv.kind ?? 'direct') === 'direct' && conv.participantUids.length === 2;
}

export function ChatView({ data }: { data: AcademyDataState }) {
  const { actor } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');

  const endRef = useRef<HTMLDivElement>(null);

  // Contacts (names and roles only)
  useEffect(() => {
    if (!actor) return;
    callProtectedApi<{ contacts: Contact[] }>('/api/contacts/list', {})
      .then((res) => setContacts(res.contacts.filter((c) => c.uid !== actor.uid)))
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل جهات الاتصال.'));
  }, [actor]);

  // Live messages for the open conversation
  useEffect(() => {
    if (!actor || !selectedId) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'academies', actor.academyId, 'conversations', selectedId, 'messages'),
      where('participantUids', 'array-contains', actor.uid),
      orderBy('createdAt', 'asc'),
      limitToLast(MESSAGE_LIMIT)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessageDoc)),
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `academies/${actor.academyId}/conversations/${selectedId}/messages`
        )
    );
    return () => unsub();
  }, [actor, selectedId]);

  // Mark as read whenever the open chat gets new messages
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!selectedId || !lastMessageId) return;
    callProtectedApi('/api/conversations/read', { conversationId: selectedId }).catch(() => {
      // Read receipts are best-effort
    });
  }, [selectedId, lastMessageId]);

  // Keep the newest message in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedId]);

  const conversations = useMemo(
    () => [...data.conversations].sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || '')),
    [data.conversations]
  );

  if (!actor) return null;

  const activeConv = conversations.find((c) => c.id === selectedId);

  const titleOf = (conv: ConversationDoc): string => {
    if (isDirect(conv)) {
      const otherUid = conv.participantUids.find((u) => u !== actor.uid) || '';
      return conv.participantNames?.[otherUid] || conv.title;
    }
    return conv.title;
  };

  const isUnread = (conv: ConversationDoc): boolean =>
    !!conv.lastMessageAt &&
    conv.lastMessageSenderUid !== actor.uid &&
    (conv.lastReadAt?.[actor.uid] ?? '') < conv.lastMessageAt;

  const previewOf = (conv: ConversationDoc): string => {
    if (!conv.lastMessageText) return 'لا توجد رسائل بعد';
    const mine = conv.lastMessageSenderUid === actor.uid;
    if (mine) return `أنت: ${conv.lastMessageText}`;
    return isDirect(conv) ? conv.lastMessageText : `${conv.lastMessageSenderName}: ${conv.lastMessageText}`;
  };

  const openDirectChat = async (contact: Contact) => {
    setError('');
    try {
      const res = await callProtectedApi<{ conversation: ConversationDoc }>('/api/conversations/create', {
        participantUids: [contact.uid],
      });
      setSelectedId(res.conversation.id);
      setNewChatOpen(false);
      setSearch('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر فتح المحادثة.');
    }
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await callProtectedApi<{ conversation: ConversationDoc }>('/api/conversations/create', {
        title: groupName.trim(),
        participantUids: picked,
      });
      setSelectedId(res.conversation.id);
      setNewChatOpen(false);
      setGroupMode(false);
      setPicked([]);
      setGroupName('');
      setSearch('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء المجموعة.');
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !selectedId || sending) return;
    setSending(true);
    setError('');
    try {
      await callProtectedApi('/api/conversations/send', { conversationId: selectedId, text: body });
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال الرسالة.');
    } finally {
      setSending(false);
    }
  };

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const filteredContacts = contacts.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));

  // Render messages with day separators and sender names in groups
  const rendered: React.ReactNode[] = [];
  let lastDay = '';
  messages.forEach((m, i) => {
    const day = dayLabel(m.createdAt);
    if (day !== lastDay) {
      lastDay = day;
      rendered.push(
        <div key={`day-${m.id}`} className="my-3 flex justify-center">
          <span className="rounded-md bg-white/80 px-3 py-1 text-[11px] text-slate-600 shadow-sm dark:bg-slate-800/80 dark:text-slate-300">
            {day}
          </span>
        </div>
      );
    }
    const mine = m.senderUid === actor.uid;
    const prev = messages[i - 1];
    const showName = !mine && activeConv && !isDirect(activeConv) && (!prev || prev.senderUid !== m.senderUid || day !== dayLabel(prev.createdAt));
    rendered.push(
      <div key={m.id} className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
        <div
          className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[65%] ${
            mine
              ? 'rounded-se-sm bg-teal-700 text-white'
              : 'rounded-ss-sm bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
          }`}
        >
          {showName && <p className="mb-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-400">{m.senderName}</p>}
          <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
          <p className={`mt-1 text-[10px] tabular-nums ${mine ? 'text-teal-100' : 'text-slate-400'}`}>
            {formatTime(m.createdAt)}
          </p>
        </div>
      </div>
    );
  });

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[480px] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Chat list */}
      <aside
        className={`${selectedId ? 'hidden' : 'flex'} w-full flex-col border-slate-200 md:flex md:w-80 md:border-e dark:border-slate-800`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="font-display text-base font-bold">المحادثات</h2>
          <button
            type="button"
            onClick={() => {
              setNewChatOpen((v) => !v);
              setGroupMode(false);
              setPicked([]);
            }}
            className="rounded-full bg-teal-700 p-2 text-white hover:bg-teal-800"
            aria-label="محادثة جديدة"
          >
            {newChatOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>

        {newChatOpen ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
              <div className="relative">
                <Search className="pointer-events-none absolute end-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث بالاسم..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pe-9 ps-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setGroupMode((v) => !v);
                  setPicked([]);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/30"
              >
                <Users className="h-4 w-4" />
                {groupMode ? 'إلغاء إنشاء المجموعة' : 'مجموعة جديدة'}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredContacts.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">لا توجد جهات اتصال مطابقة.</p>
              ) : (
                filteredContacts.map((c) => {
                  const checked = picked.includes(c.uid);
                  return (
                    <button
                      key={c.uid}
                      type="button"
                      onClick={() => {
                        if (!groupMode) {
                          void openDirectChat(c);
                          return;
                        }
                        setPicked((prev) => (checked ? prev.filter((u) => u !== c.uid) : [...prev, c.uid]));
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <Avatar name={c.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c.name}</p>
                        <p className="text-[11px] text-slate-500">{ROLE_LABELS[c.role]}</p>
                      </div>
                      {groupMode && (
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded border ${
                            checked ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {checked && <Check className="h-3.5 w-3.5" />}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {groupMode && (
              <form onSubmit={(e) => void createGroup(e)} className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
                <input
                  type="text"
                  required
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="اسم المجموعة"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
                <button
                  type="submit"
                  disabled={picked.length < 2 || groupName.trim().length < 2}
                  className="w-full rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  إنشاء المجموعة ({picked.length} مختارين)
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-500">
                <MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                لا توجد محادثات بعد. اضغط + لبدء محادثة.
              </div>
            ) : (
              conversations.map((conv) => {
                const unread = isUnread(conv);
                const title = titleOf(conv);
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedId(conv.id)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-start transition-colors ${
                      selectedId === conv.id
                        ? 'bg-teal-50 dark:bg-teal-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    {isDirect(conv) ? <Avatar name={title} /> : <GroupAvatar />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm ${unread ? 'font-extrabold' : 'font-semibold'}`}>{title}</p>
                        <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                          {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ''}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className={`truncate text-xs ${unread ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500'}`}>
                          {previewOf(conv)}
                        </p>
                        {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-600" aria-label="رسالة غير مقروءة" />}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </aside>

      {/* Conversation */}
      <section className={`${selectedId ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex`}>
        {!selectedId ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            اختر محادثة لعرض الرسائل
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setSelectedId('')}
                className="rounded-full p-1.5 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800"
                aria-label="رجوع"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
              {activeConv && isDirect(activeConv) ? (
                <Avatar name={titleOf(activeConv)} />
              ) : (
                <GroupAvatar />
              )}
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold">{activeConv ? titleOf(activeConv) : 'جاري فتح المحادثة...'}</h3>
                {activeConv && !isDirect(activeConv) && (
                  <p className="truncate text-[11px] text-slate-500">
                    {activeConv.participantUids.length} أعضاء
                  </p>
                )}
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-slate-100 px-3 py-4 sm:px-6 dark:bg-slate-950">
              {messages.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">ابدأ المحادثة بإرسال أول رسالة.</p>
              ) : (
                rendered
              )}
              <div ref={endRef} />
            </div>

            {error && (
              <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}

            <form
              onSubmit={(e) => void sendMessage(e)}
              className="flex items-end gap-2 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <textarea
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onComposerKey}
                maxLength={2000}
                disabled={!activeConv}
                placeholder="اكتب رسالة..."
                className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="submit"
                disabled={!text.trim() || sending || !activeConv}
                className="rounded-full bg-teal-700 p-2.5 text-white hover:bg-teal-800 disabled:opacity-50"
                aria-label="إرسال"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-800 dark:bg-teal-900 dark:text-teal-200">
      {initials(name) || '?'}
    </span>
  );
}

function GroupAvatar() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
      <Users className="h-5 w-5" />
    </span>
  );
}

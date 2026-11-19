import React, { useEffect, useState } from 'react';
import {
  BellRing,
  FileUp,
  MessageSquare,
  Send,
  Download,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import type { AcademyDataState } from '../hooks/useAcademyData';
import { callProtectedApi } from '../lib/apiClient';
import {
  db,
  handleFirestoreError,
  OperationType,
  registerWebPushToken,
  storage,
} from '../lib/firebase';
import { formatDateArabic } from '../shared/labels';
import type { MessageDoc } from '../shared/types';

export function CommunicationsResourcesView({ data }: { data: AcademyDataState }) {
  const { actor } = useAuth();
  const [selectedConvId, setSelectedConvId] = useState<string>('');
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [messageText, setMessageText] = useState('');

  // New conversation
  const [convTitle, setConvTitle] = useState('');
  const [convParticipantUid, setConvParticipantUid] = useState('');

  // Resource upload
  const [resGroupId, setResGroupId] = useState('');
  const [resTitle, setResTitle] = useState('');
  const [resFile, setResFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Notification broadcast
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!actor || !selectedConvId) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'academies', actor.academyId, 'conversations', selectedConvId, 'messages'),
      where('participantUids', 'array-contains', actor.uid),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessageDoc));
      },
      (err) => {
        handleFirestoreError(
          err,
          OperationType.LIST,
          `academies/${actor.academyId}/conversations/${selectedConvId}/messages`
        );
      }
    );
    return () => unsub();
  }, [actor, selectedConvId]);

  if (!actor) return null;

  const activeConv = data.conversations.find((c) => c.id === selectedConvId);

  const handleCreateConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await callProtectedApi<{ conversation: { id: string } }>(
        '/api/conversations/create',
        {
          title: convTitle,
          participantUids: [convParticipantUid],
        }
      );
      setConvTitle('');
      setConvParticipantUid('');
      setSelectedConvId(res.conversation.id);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر بدء المحادثة.' });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !messageText.trim()) return;
    setFeedback(null);
    try {
      const msgRef = doc(
        collection(db, 'academies', actor.academyId, 'conversations', activeConv.id, 'messages')
      );
      const payload: MessageDoc = {
        id: msgRef.id,
        academyId: actor.academyId,
        conversationId: activeConv.id,
        participantUids: activeConv.participantUids,
        senderUid: actor.uid,
        senderName: activeConv.participantNames?.[actor.uid] || actor.email,
        senderRole: actor.role,
        text: messageText.trim(),
        createdAt: new Date().toISOString(),
      };
      await setDoc(msgRef, payload);
      setMessageText('');
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر إرسال الرسالة.' });
    }
  };

  const handleUploadResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resFile || !resGroupId) return;
    setFeedback(null);
    setUploading(true);
    try {
      const safeName = `${Date.now()}_${resFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const storagePath = `academies/${actor.academyId}/groups/${resGroupId}/${safeName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, resFile);
      const downloadUrl = await getDownloadURL(storageRef);

      await callProtectedApi('/api/resources/register', {
        groupId: resGroupId,
        title: resTitle,
        fileName: resFile.name,
        storagePath,
        downloadUrl,
        sizeBytes: resFile.size,
        contentType: resFile.type || 'application/octet-stream',
      });

      setFeedback({ type: 'ok', text: 'تم رفع الملف إلى Firebase Storage وتسجيله بنجاح.' });
      setResTitle('');
      setResFile(null);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر رفع الملف.' });
    } finally {
      setUploading(false);
    }
  };

  const handleEnablePush = async () => {
    setFeedback(null);
    try {
      const token = await registerWebPushToken();
      if (!token) {
        setFeedback({
          type: 'err',
          text: 'يرجى ضبط VITE_FIREBASE_VAPID_KEY وتفعيل إذن الإشعارات في المتصفح.',
        });
        return;
      }
      await setDoc(doc(db, 'academies', actor.academyId, 'fcmTokens', actor.uid), {
        uid: actor.uid,
        academyId: actor.academyId,
        token,
        updatedAt: new Date().toISOString(),
      });
      setPushEnabled(true);
      setFeedback({ type: 'ok', text: 'تم تفعيل إشعارات المتصفح (FCM) لهذا الجهاز.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر تفعيل الإشعارات.' });
    }
  };

  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const recipientUids = data.members.filter((m) => m.status === 'active').map((m) => m.uid);
    try {
      await callProtectedApi('/api/notifications/send', {
        title: notifTitle,
        body: notifBody,
        category: 'system',
        recipientUids,
      });
      setFeedback({ type: 'ok', text: 'تم إرسال الإشعار لأعضاء الأكاديمية.' });
      setNotifTitle('');
      setNotifBody('');
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر إرسال الإشعار.' });
    }
  };

  const canUpload = ['owner', 'supervisor', 'teacher'].includes(actor.role);

  return (
    <div className="space-y-8">
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-medium ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Conversations */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-base font-bold">المحادثات</h2>
          </div>

          {data.members.length > 1 && (
            <form onSubmit={(e) => void handleCreateConversation(e)} className="mb-4 space-y-2 border-b border-slate-100 pb-4 dark:border-slate-800">
              <input
                type="text"
                required
                value={convTitle}
                onChange={(e) => setConvTitle(e.target.value)}
                placeholder="عنوان المحادثة"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <select
                required
                value={convParticipantUid}
                onChange={(e) => setConvParticipantUid(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">اختر عضوًا للمحادثة...</option>
                {data.members
                  .filter((m) => m.uid !== actor.uid && m.status === 'active')
                  .map((m) => (
                    <option key={m.uid} value={m.uid}>
                      {m.name}
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                className="w-full rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
              >
                بدء محادثة
              </button>
            </form>
          )}

          <div className="space-y-1.5">
            {data.conversations.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">لا توجد محادثات بعد.</p>
            ) : (
              data.conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedConvId(c.id)}
                  className={`w-full rounded-lg border p-3 text-right text-xs transition-colors ${
                    selectedConvId === c.id
                      ? 'border-teal-600 bg-teal-50/50 dark:border-teal-500 dark:bg-teal-950/30'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{c.title}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{formatDateArabic(c.lastMessageAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex min-h-[340px] flex-col rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
          {!activeConv ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              اختر محادثة من القائمة لعرض الرسائل
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
                <h3 className="font-display text-base font-bold">{activeConv.title}</h3>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto py-4">
                {messages.map((m) => {
                  const mine = m.senderUid === actor.uid;
                  return (
                    <div
                      key={m.id}
                      className={`max-w-[80%] rounded-lg p-3 text-sm ${
                        mine
                          ? 'mr-auto bg-teal-700 text-white'
                          : 'ml-auto border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
                      }`}
                    >
                      <p className="text-[11px] opacity-80">{m.senderName}</p>
                      <p className="mt-1">{m.text}</p>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={(e) => void handleSendMessage(e)} className="flex gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="اكتب رسالتك هنا..."
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  <Send className="h-4 w-4" />
                  <span>إرسال</span>
                </button>
              </form>
            </>
          )}
        </div>
      </section>

      {/* Storage Educational Resources & FCM */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <FileUp className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-base font-bold">الملفات التعليمية (Firebase Storage)</h2>
          </div>

          {canUpload && (
            <form onSubmit={(e) => void handleUploadResource(e)} className="mb-5 space-y-3 border-b border-slate-100 pb-5 dark:border-slate-800">
              <select
                required
                value={resGroupId}
                onChange={(e) => setResGroupId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">اختر الحلقة...</option>
                {data.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                value={resTitle}
                onChange={(e) => setResTitle(e.target.value)}
                placeholder="عنوان الملف (مثال: مقرر التجويد PDF)"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              <input
                type="file"
                required
                onChange={(e) => setResFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-600 dark:text-slate-300"
              />
              <button
                type="submit"
                disabled={uploading}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {uploading ? 'جاري الرفع...' : 'رفع ومشاركة الملف'}
              </button>
            </form>
          )}

          {data.resources.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">لا توجد ملفات مرفوعة بعد.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.resources.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.title}</p>
                    <p className="truncate text-xs text-slate-500">{r.fileName}</p>
                  </div>
                  <a
                    href={r.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>تنزيل</span>
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Notifications & FCM */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-base font-bold">إشعارات السحابة (FCM)</h2>
            </div>
            <button
              type="button"
              onClick={() => void handleEnablePush()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {pushEnabled ? 'تم التفعيل' : 'تفعيل إشعارات المتصفح'}
            </button>
          </div>

          {canUpload && data.members.length > 0 && (
            <form onSubmit={(e) => void handleBroadcastNotification(e)} className="space-y-3">
              <input
                type="text"
                required
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                placeholder="عنوان الإشعار"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              <textarea
                required
                rows={3}
                value={notifBody}
                onChange={(e) => setNotifBody(e.target.value)}
                placeholder="نص التنبيه للأعضاء..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                إرسال إشعار فوري
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

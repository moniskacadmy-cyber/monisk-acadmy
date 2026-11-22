import React, { useState } from 'react';
import { BellRing, Download, FileUp } from 'lucide-react';
import { collection, doc, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import type { AcademyDataState } from '../hooks/useAcademyData';
import { callProtectedApi } from '../lib/apiClient';
import { db, registerWebPushToken, storage } from '../lib/firebase';

export function CommunicationsResourcesView({ data }: { data: AcademyDataState }) {
  const { actor } = useAuth();

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

  if (!actor) return null;

  const isStaff = ['owner', 'supervisor', 'teacher'].includes(actor.role);

  // Who a broadcast can reach. Teachers only see their own students and those students' parents.
  const broadcastRecipients = (() => {
    if (actor.role === 'teacher') {
      const uids = new Set<string>();
      for (const s of data.students) {
        if (s.userId) uids.add(s.userId);
        (s.parentUids || []).forEach((u) => uids.add(u));
      }
      return Array.from(uids);
    }
    return data.members.filter((m) => m.status === 'active' && m.uid !== actor.uid).map((m) => m.uid);
  })();

  const handleUploadResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resFile || !resGroupId) return;
    setFeedback(null);
    setUploading(true);
    try {
      // Each file gets its own folder named after its Firestore resource id.
      const resourceId = doc(collection(db, 'academies', actor.academyId, 'resources')).id;
      const safeName = resFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `academies/${actor.academyId}/resources/${resourceId}/${safeName}`;
      await uploadBytes(ref(storage, storagePath), resFile, { contentType: resFile.type || undefined });

      await callProtectedApi('/api/resources/register', {
        resourceId,
        groupId: resGroupId,
        title: resTitle,
        fileName: resFile.name,
        storagePath,
        sizeBytes: resFile.size,
        contentType: resFile.type || 'application/octet-stream',
      });

      setFeedback({ type: 'ok', text: 'تم رفع الملف وتسجيله بنجاح.' });
      setResTitle('');
      setResFile(null);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر رفع الملف.' });
    } finally {
      setUploading(false);
    }
  };

  // Download link is created at click time, so Storage rules are checked every time.
  const handleDownload = async (storagePath: string) => {
    setFeedback(null);
    try {
      const url = await getDownloadURL(ref(storage, storagePath));
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setFeedback({ type: 'err', text: 'لا تملك صلاحية تنزيل هذا الملف.' });
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
      setFeedback({ type: 'ok', text: 'تم تفعيل إشعارات المتصفح لهذا الجهاز.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر تفعيل الإشعارات.' });
    }
  };

  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await callProtectedApi('/api/notifications/send', {
        title: notifTitle,
        body: notifBody,
        category: 'system',
        recipientUids: broadcastRecipients,
      });
      setFeedback({ type: 'ok', text: 'تم إرسال الإشعار.' });
      setNotifTitle('');
      setNotifBody('');
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر إرسال الإشعار.' });
    }
  };

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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <FileUp className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-base font-bold">الملفات التعليمية</h2>
          </div>

          {isStaff && (
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
                  <button
                    type="button"
                    onClick={() => void handleDownload(r.storagePath)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>تنزيل</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-base font-bold">الإشعارات</h2>
            </div>
            <button
              type="button"
              onClick={() => void handleEnablePush()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {pushEnabled ? 'تم التفعيل' : 'تفعيل إشعارات المتصفح'}
            </button>
          </div>

          {isStaff && broadcastRecipients.length > 0 && (
            <form onSubmit={(e) => void handleBroadcastNotification(e)} className="space-y-3">
              <p className="text-xs text-slate-500">
                {actor.role === 'teacher'
                  ? `سيصل الإشعار إلى ${broadcastRecipients.length} من طلابك وأولياء أمورهم.`
                  : `سيصل الإشعار إلى ${broadcastRecipients.length} عضوًا نشطًا.`}
              </p>
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
                placeholder="نص الإشعار..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                إرسال الإشعار
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

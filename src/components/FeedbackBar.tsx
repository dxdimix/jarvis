"use client";

// 返事ごとの評価（よい / よくない）と、ひとことの感想。キーミスは次の会話からこれを参考にする。

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Feedback = { rating: 1 | -1; comment: string | null };

export function FeedbackBar({
  supabase,
  messageId,
  value,
  onChange,
}: {
  supabase: SupabaseClient;
  messageId: string;
  value: Feedback | undefined;
  onChange: (f: Feedback | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(value?.comment ?? "");
  const [error, setError] = useState("");

  async function save(rating: 1 | -1, text: string | null) {
    setError("");
    const { error } = await supabase
      .from("feedback")
      .upsert({ message_id: messageId, rating, comment: text?.trim() || null }, { onConflict: "message_id" });
    if (error) return setError(`保存できませんでした: ${error.message}`);
    onChange({ rating, comment: text?.trim() || null });
  }

  async function clear() {
    const { error } = await supabase.from("feedback").delete().eq("message_id", messageId);
    if (error) return setError(`取り消せませんでした: ${error.message}`);
    onChange(undefined);
    setEditing(false);
  }

  const btn = "rounded px-1.5 py-0.5 text-xs hover:bg-slate-700";
  return (
    <div className="mt-1 text-xs text-slate-400">
      <div className="flex items-center gap-1">
        <button
          aria-label="よい返事"
          aria-pressed={value?.rating === 1}
          onClick={() => (value?.rating === 1 ? clear() : save(1, value?.comment ?? null))}
          className={btn + (value?.rating === 1 ? " text-emerald-300" : "")}
        >
          👍
        </button>
        <button
          aria-label="よくない返事"
          aria-pressed={value?.rating === -1}
          onClick={() => {
            if (value?.rating === -1) return clear();
            save(-1, value?.comment ?? null);
            setEditing(true);
          }}
          className={btn + (value?.rating === -1 ? " text-rose-300" : "")}
        >
          👎
        </button>
        {value && !editing && (
          <button onClick={() => setEditing(true)} className="underline">
            {value.comment ? `「${value.comment}」` : "ひとこと添える"}
          </button>
        )}
      </div>
      {editing && value && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(value.rating, comment);
            setEditing(false);
          }}
          className="mt-1 flex gap-1"
        >
          <input
            autoFocus
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={value.rating === -1 ? "どこがよくなかった？（例: 長い、言い方が固い）" : "よかったところ（任意）"}
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
          />
          <button className="rounded bg-cyan-700 px-2 text-white">保存</button>
        </form>
      )}
      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}

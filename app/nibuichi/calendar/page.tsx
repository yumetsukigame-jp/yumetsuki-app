"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, documentId, endAt, getDocs, orderBy, query, startAt } from "firebase/firestore";
import { db } from "@/firebase";
import LoadingState from "@/app/components/LoadingState";

type DailyResult = {
  result?: string;
};

const resultStyles: Record<string, { label: string; background: string; color: string }> = {
  bakuado: { label: "爆アド", background: "#fef2f2", color: "#dc2626" },
  nibuni: { label: "勝", background: "#eff6ff", color: "#2563eb" },
  nibuichi: { label: "分", background: "#f0fdf4", color: "#16a34a" },
  nibuzero: { label: "敗", background: "#f9fafb", color: "#6b7280" },
};

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function formatMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function moveMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export default function NibuichiCalendarPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
    );
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [results, setResults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadResults = async () => {
      setLoading(true);
      setLoadError("");
      const month = formatMonth(selectedMonth);

      try {
        const resultQuery = query(
          collection(db, "nibuichi_global"),
          orderBy(documentId()),
          startAt(`${month}-01`),
          endAt(`${month}-\uf8ff`)
        );
        const snapshot = await getDocs(resultQuery);
        const nextResults = Object.fromEntries(
          snapshot.docs.map((result) => [
            result.id,
            (result.data() as DailyResult).result ?? "",
          ])
        );

        if (!cancelled) {
          setResults(nextResults);
        }
      } catch (error) {
        console.error("ニブイチ勝敗カレンダーの読み込みに失敗しました", error);
        if (!cancelled) {
          setResults({});
          setLoadError("勝敗データを読み込めませんでした。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadResults();

    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  const year = selectedMonth.getFullYear();
  const monthIndex = selectedMonth.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const calendarDays = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const monthlyCounts = Object.fromEntries(
    Object.keys(resultStyles).map((result) => [
      result,
      Object.values(results).filter((value) => value === result).length,
    ])
  ) as Record<string, number>;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <Link href="/nibuichi" style={{ color: "#2563eb", fontWeight: "bold" }}>
        ← ニブイチへ戻る
      </Link>
      <h1 style={{ margin: "20px 0 8px", textAlign: "center" }}>ニブイチ勝敗カレンダー</h1>
      <p style={{ margin: "0 0 20px", textAlign: "center", color: "#555" }}>
        ニブイチの結果を月ごとに確認できます。
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button type="button" onClick={() => setSelectedMonth((month) => moveMonth(month, -1))} style={monthButtonStyle}>
          ← 先月
        </button>
        <strong style={{ fontSize: "1.15rem" }}>{year}年{monthIndex + 1}月</strong>
        <button type="button" onClick={() => setSelectedMonth((month) => moveMonth(month, 1))} style={monthButtonStyle}>
          翌月 →
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {Object.entries(resultStyles).map(([result, value]) => (
          <div
            key={result}
            style={{
              padding: "10px 4px",
              background: value.background,
              borderRadius: 8,
              color: value.color,
              fontWeight: "bold",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "0.85rem" }}>{value.label}</div>
            <div style={{ marginTop: 2, fontSize: "1.15rem" }}>{monthlyCounts[result]}回</div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          borderTop: "1px solid #d1d5db",
          borderLeft: "1px solid #d1d5db",
        }}
      >
        {weekdays.map((weekday, index) => (
          <div
            key={weekday}
            style={{
              padding: "8px 2px",
              borderRight: "1px solid #d1d5db",
              borderBottom: "1px solid #d1d5db",
              textAlign: "center",
              fontWeight: "bold",
              color: index === 0 ? "#dc2626" : index === 6 ? "#2563eb" : "#374151",
            }}
          >
            {weekday}
          </div>
        ))}
        {calendarDays.map((day, index) => {
          if (!day) {
            return <div key={`blank-${index}`} style={calendarCellStyle} />;
          }

          const date = `${formatMonth(selectedMonth)}-${String(day).padStart(2, "0")}`;
          const result = results[date];
          const resultStyle = resultStyles[result];

          return (
            <div
              key={date}
              style={{
                ...calendarCellStyle,
                background: resultStyle?.background ?? "white",
              }}
            >
              <span style={{ color: index % 7 === 0 ? "#dc2626" : index % 7 === 6 ? "#2563eb" : "#111827" }}>
                {day}
              </span>
              {resultStyle && (
                <strong style={{ display: "block", marginTop: 8, color: resultStyle.color, fontSize: "0.85rem" }}>
                  {resultStyle.label}
                </strong>
              )}
            </div>
          );
        })}
      </div>

      {loading && <LoadingState message="勝敗データを読み込み中…" />}
      {loadError && <p style={{ color: "#dc2626", textAlign: "center" }}>{loadError}</p>}
      {!loading && !loadError && Object.keys(results).length === 0 && (
        <p style={{ color: "#6b7280", textAlign: "center", marginTop: 20 }}>
          この月の確定済み結果はありません。
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12, marginTop: 20, fontSize: "0.9rem" }}>
        {Object.entries(resultStyles).map(([, value]) => (
          <span key={value.label} style={{ color: value.color, fontWeight: "bold" }}>
            ● {value.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const monthButtonStyle = {
  padding: "8px 12px",
  border: "1px solid #2563eb",
  borderRadius: 6,
  background: "white",
  color: "#2563eb",
  cursor: "pointer",
  fontWeight: "bold",
};

const calendarCellStyle = {
  minHeight: 76,
  padding: 8,
  borderRight: "1px solid #d1d5db",
  borderBottom: "1px solid #d1d5db",
};

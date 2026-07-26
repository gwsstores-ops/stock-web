"use client";

import { FormEvent, useState } from "react";
import AppHeader from "@/components/AppHeader";
import SearchResults, {
  type SearchResultRow
} from "@/components/SearchResults";

type AskResponse = {
  rows?: SearchResultRow[];
  answer?: string;
  clarification?: string;
  error?: string;
};

export default function AskStockPage() {
  const [question, setQuestion] = useState("");
  const [rows, setRows] = useState<SearchResultRow[]>([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "empty" | "clarification" | "error" | ""
  >("");
  const [loading, setLoading] = useState(false);

  const askStock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!question.trim() || loading) return;

    setLoading(true);
    setRows([]);
    setMessage("");
    setMessageType("");

    try {
      const response = await fetch("/api/ask-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const data: AskResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Stock search failed");
      }

      const nextRows = data.rows || [];
      setRows(nextRows);

      if (data.clarification) {
        setMessage(data.clarification);
        setMessageType("clarification");
      } else if (nextRows.length > 0) {
        setMessage("IN STOCK");
        setMessageType("success");
      } else {
        setMessage("NOT IN STOCK");
        setMessageType("empty");
      }
    } catch (error) {
      console.error("Ask Stock failed:", error);
      setMessage("SEARCH FAILED");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell">
      <AppHeader title="Ask Stock" />

      <section className="panel">
        <form onSubmit={askStock} className="form-stack">
          <label className="field">
            <span className="field-label">Stock question</span>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="E.G. IS THERE SETS ZINC PLATED 20 BY 50 IN GWS?"
              className="control ask-stock-input"
              rows={4}
            />
          </label>

          <button
            type="submit"
            className="button button-primary button-block"
            disabled={!question.trim() || loading}
          >
            {loading ? "Searching" : "Search stock"}
          </button>
        </form>
      </section>

      {message && (
        <section
          className={`panel ask-stock-message ask-stock-${messageType}`}
          role={messageType === "error" ? "alert" : "status"}
        >
          {message}
        </section>
      )}

      <SearchResults rows={rows} />
    </main>
  );
}

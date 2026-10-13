import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowRightLeft, FileText, FileUp, FileWarning, RefreshCw, ShieldCheck, FileType2 } from "lucide-react";
import { getAllNotesWithIssues } from "./services/noteStorage";
import type { Note } from "./types/note";
import { extractTextFromPdf, exportPdf, exportWord } from "./services/documentConversion";
import "./document-converter.css";

type NoteOption = Pick<Note, "id" | "title" | "plainText" | "updatedAt" | "status">;

export default function DocumentConverter() {
  const [notes, setNotes] = useState<NoteOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState("");
  const [pdfText, setPdfText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAllNotesWithIssues().then((result) => {
      if (cancelled) return;
      const active = result.notes.filter((note) => note.status === "active").map(({ id, title, plainText, updatedAt, status }) => ({ id, title, plainText, updatedAt, status }));
      setNotes(active);
      setSelectedId(active[0]?.id ?? "");
    }).catch(() => {
      if (!cancelled) setError("Saved notes could not be loaded. Your existing notes have not been changed.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(() => notes.find((note) => note.id === selectedId), [notes, selectedId]);

  const runPdfImport = async () => {
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const extracted = await extractTextFromPdf(file);
      setPdfTitle(file.name.replace(/\.pdf$/i, "") || "Converted document");
      setPdfText(extracted);
      setMessage("Text extracted locally. Review it below, then export a Word document.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not extract text from this PDF.");
    } finally { setBusy(false); }
  };

  return (
    <div className="document-converter-page">
      <header className="document-converter-header">
        <div><p className="document-converter-eyebrow"><ArrowRightLeft size={14} /> DOCUMENT WORKSPACE</p><h1>File <em>converter</em></h1><p>Convert text-based PDFs to Word, and export your saved StudyVault notes as PDF or Word documents.</p></div>
        <span className="document-converter-local"><ShieldCheck size={15} /> Runs in your browser</span>
      </header>
      <div className="document-converter-grid">
        <section className="document-converter-card">
          <div className="document-converter-card-icon"><FileUp size={20} /></div><p className="document-converter-step">01 · PDF TO WORD</p><h2>Bring a PDF into Word</h2><p className="document-converter-description">Select a PDF and extract its text into an editable Word document. The PDF stays on your device.</p>
          <label className="document-converter-upload"><input type="file" accept="application/pdf,.pdf" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPdfText(""); setError(""); setMessage(""); }} /><FileText size={18} /><span>{file ? file.name : "Choose a PDF file"}</span><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "PDF · Text-based documents work best"}</small></label>
          <button className="document-converter-primary" onClick={runPdfImport} disabled={!file || busy}>{busy ? <RefreshCw size={15} className="document-converter-spin" /> : <ArrowRightLeft size={15} />}{busy ? "Extracting text…" : "Extract PDF text"}</button>
          {pdfText && <div className="document-converter-preview"><label htmlFor="converted-text-title">Word document title</label><input id="converted-text-title" value={pdfTitle} onChange={(event) => setPdfTitle(event.target.value)} /><label htmlFor="converted-text-body">Extracted text preview</label><textarea id="converted-text-body" value={pdfText} onChange={(event) => setPdfText(event.target.value)} rows={9} /><button className="document-converter-secondary" onClick={() => exportWord(pdfTitle || "Converted document", pdfText)}><ArrowDownToLine size={15} /> Download Word (.docx)</button></div>}
          <p className="document-converter-note"><FileWarning size={14} /> Scanned/image-only PDFs, encrypted files and some complex font encodings are not supported. OCR and exact page layout are not included.</p>
        </section>

        <section className="document-converter-card">
          <div className="document-converter-card-icon"><FileType2 size={20} /></div><p className="document-converter-step">02 · NOTES TO FILE</p><h2>Export your notes</h2><p className="document-converter-description">Choose any active saved note. Export a downloadable Word document or a paginated PDF without changing the original.</p>
          {loading ? <div className="document-converter-loading">Loading saved notes…</div> : notes.length ? <>
            <label className="document-converter-field" htmlFor="note-export-select">Saved note</label><select id="note-export-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{notes.map((note) => <option value={note.id} key={note.id}>{note.title || "Untitled note"}</option>)}</select>
            {selected && <div className="document-converter-note-preview"><strong>{selected.title || "Untitled note"}</strong><p>{selected.plainText.slice(0, 220) || "This note has no plain text to export yet."}{selected.plainText.length > 220 ? "…" : ""}</p><small>Last updated {new Date(selected.updatedAt).toLocaleDateString()}</small></div>}
            <div className="document-converter-export-actions"><button className="document-converter-primary" disabled={!selected || !selected.plainText.trim()} onClick={() => { if (!selected) return; exportPdf(selected.title || "StudyVault note", selected.plainText); setMessage("PDF export created. Your original note is unchanged."); setError(""); }}><ArrowDownToLine size={15} /> Download PDF</button><button className="document-converter-secondary" disabled={!selected || !selected.plainText.trim()} onClick={() => { if (!selected) return; exportWord(selected.title || "StudyVault note", selected.plainText); setMessage("Word document created. Your original note is unchanged."); setError(""); }}><ArrowDownToLine size={15} /> Download Word</button></div>
          </> : <div className="document-converter-empty">No active saved notes found yet. Create a note first, then return here to export it.</div>}
          <p className="document-converter-note"><ShieldCheck size={14} /> Exports include the note title and plain text. Rich formatting and embedded images are not yet preserved.</p>
        </section>
      </div>
      {(error || message) && <p className={error ? "document-converter-feedback document-converter-error" : "document-converter-feedback document-converter-success"} role={error ? "alert" : "status"}>{error || message}</p>}
      <p className="document-converter-privacy">Local-first conversion · No upload service · Your source notes and files are never overwritten.</p>
    </div>
  );
}

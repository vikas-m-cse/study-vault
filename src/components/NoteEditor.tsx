import { EditorContent, useEditor } from "@tiptap/react";
import CharacterCount from "@tiptap/extension-character-count";
import CodeBlock from "@tiptap/extension-code-block";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Bold,
    CheckSquare,
    Code2,
    Heading1,
    Heading2,
    Heading3,
    Highlighter,
    Italic,
    Link2,
    List,
    ListOrdered,
    Quote,
    Redo2,
    RemoveFormatting,
    Strikethrough,
    Underline as UnderlineIcon,
    Undo2,
} from "lucide-react";
import type { TipTapDocument } from "../types/note";

export type NoteEditorChange = {
    content: TipTapDocument;
    plainText: string;
};

type NoteEditorProps = {
    content: TipTapDocument;
    readOnly?: boolean;
    onChange: (change: NoteEditorChange) => void;
};

type ToolbarButtonProps = {
    label: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
};

function ToolbarButton({
    label,
    active = false,
    disabled = false,
    onClick,
    children,
}: ToolbarButtonProps) {
    return (
        <button
            type="button"
            className={`notes-editor-tool ${active ? "active" : ""}`}
            aria-label={label}
            title={label}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

export function NoteEditor({ content, readOnly = false, onChange }: NoteEditorProps) {
    const editor = useEditor({
        editable: !readOnly,
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                codeBlock: false,
                link: false,
                underline: false,
            }),
            CodeBlock,
            Underline,
            Highlight,
            Link.configure({ openOnClick: false, autolink: true }),
            Placeholder.configure({ placeholder: "Start writing your note..." }),
            TaskList,
            TaskItem.configure({ nested: true }),
            TextAlign.configure({ types: ["heading", "paragraph"] }),
            CharacterCount,
        ],
        content,
        onUpdate: ({ editor: currentEditor }) => {
            onChange({
                content: currentEditor.getJSON() as TipTapDocument,
                plainText: currentEditor.getText({ blockSeparator: "\n" }),
            });
        },
    });

    if (!editor) {
        return <div className="notes-editor-loading">Preparing editor...</div>;
    }

    const run = (command: () => boolean) => {
        if (!readOnly) command();
    };

    const toggleLink = () => {
        if (readOnly) return;
        if (editor.isActive("link")) {
            editor.chain().focus().unsetLink().run();
            return;
        }
        const url = window.prompt("Enter a URL");
        if (url?.trim()) {
            editor.chain().focus().setLink({ href: url.trim() }).run();
        }
    };

    return (
        <div className={`notes-editor ${readOnly ? "read-only" : ""}`}>
            <div className="notes-editor-toolbar" aria-label="Text formatting">
                <div className="notes-editor-tool-group">
                    <ToolbarButton
                        label="Undo"
                        disabled={readOnly || !editor.can().undo()}
                        onClick={() => run(() => editor.chain().focus().undo().run())}
                    >
                        <Undo2 size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Redo"
                        disabled={readOnly || !editor.can().redo()}
                        onClick={() => run(() => editor.chain().focus().redo().run())}
                    >
                        <Redo2 size={16} />
                    </ToolbarButton>
                </div>

                <div className="notes-editor-tool-group">
                    <ToolbarButton
                        label="Heading 1"
                        active={editor.isActive("heading", { level: 1 })}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}
                    >
                        <Heading1 size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Heading 2"
                        active={editor.isActive("heading", { level: 2 })}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
                    >
                        <Heading2 size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Heading 3"
                        active={editor.isActive("heading", { level: 3 })}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
                    >
                        <Heading3 size={16} />
                    </ToolbarButton>
                </div>

                <div className="notes-editor-tool-group">
                    <ToolbarButton
                        label="Bold"
                        active={editor.isActive("bold")}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleBold().run())}
                    >
                        <Bold size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Italic"
                        active={editor.isActive("italic")}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleItalic().run())}
                    >
                        <Italic size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Underline"
                        active={editor.isActive("underline")}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleUnderline().run())}
                    >
                        <UnderlineIcon size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Strikethrough"
                        active={editor.isActive("strike")}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleStrike().run())}
                    >
                        <Strikethrough size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Highlight"
                        active={editor.isActive("highlight")}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleHighlight().run())}
                    >
                        <Highlighter size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Clear formatting"
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().clearNodes().unsetAllMarks().run())}
                    >
                        <RemoveFormatting size={16} />
                    </ToolbarButton>
                </div>

                <div className="notes-editor-tool-group">
                    <ToolbarButton
                        label="Bullet list"
                        active={editor.isActive("bulletList")}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleBulletList().run())}
                    >
                        <List size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Numbered list"
                        active={editor.isActive("orderedList")}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleOrderedList().run())}
                    >
                        <ListOrdered size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Checklist"
                        active={editor.isActive("taskList")}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleTaskList().run())}
                    >
                        <CheckSquare size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Blockquote"
                        active={editor.isActive("blockquote")}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleBlockquote().run())}
                    >
                        <Quote size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Code block"
                        active={editor.isActive("codeBlock")}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().toggleCodeBlock().run())}
                    >
                        <Code2 size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Link"
                        active={editor.isActive("link")}
                        disabled={readOnly}
                        onClick={toggleLink}
                    >
                        <Link2 size={16} />
                    </ToolbarButton>
                </div>

                <div className="notes-editor-tool-group">
                    <ToolbarButton
                        label="Align left"
                        active={editor.isActive({ textAlign: "left" })}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().setTextAlign("left").run())}
                    >
                        <AlignLeft size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Align center"
                        active={editor.isActive({ textAlign: "center" })}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().setTextAlign("center").run())}
                    >
                        <AlignCenter size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Align right"
                        active={editor.isActive({ textAlign: "right" })}
                        disabled={readOnly}
                        onClick={() => run(() => editor.chain().focus().setTextAlign("right").run())}
                    >
                        <AlignRight size={16} />
                    </ToolbarButton>
                </div>
            </div>

            <EditorContent editor={editor} className="notes-editor-content" />
        </div>
    );
}

import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  input,
  type OnDestroy,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { javascript } from '@codemirror/lang-javascript';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';

/** A CodeMirror 6 JavaScript editor. Two-way via [value] / (valueChange); Ctrl/⌘+Enter emits (run). */
@Component({
  selector: 'sb-code-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="code-editor" #host></div>`,
})
export class CodeEditorComponent implements AfterViewInit, OnDestroy {
  readonly value = input.required<string>();
  readonly readOnly = input(false);
  readonly label = input('Code editor');
  readonly valueChange = output<string>();
  readonly run = output<void>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly editable = new Compartment();
  private view: EditorView | null = null;

  constructor() {
    effect(() => {
      const value = this.value();
      const readOnly = this.readOnly();
      untracked(() => this.sync(value, readOnly));
    });
  }

  ngAfterViewInit() {
    this.view = new EditorView({
      parent: this.host().nativeElement,
      state: EditorState.create({
        doc: this.value(),
        extensions: [
          basicSetup,
          javascript(),
          Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (this.run.emit(), true) }])),
          this.editable.of(this.editableExtensions(this.readOnly())),
          EditorView.contentAttributes.of({ 'aria-label': this.label() }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) this.valueChange.emit(u.state.doc.toString());
          }),
        ],
      }),
    });
  }

  ngOnDestroy() {
    this.view?.destroy();
  }

  /** Moves the cursor to a 1-based line and scrolls it into view. */
  revealLine(n: number) {
    const view = this.view;
    if (!view) return;
    const line = view.state.doc.line(Math.min(Math.max(1, n), view.state.doc.lines));
    view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
    view.focus();
  }

  private sync(value: string, readOnly: boolean) {
    const view = this.view;
    if (!view) return;
    const effects = this.editable.reconfigure(this.editableExtensions(readOnly));
    const current = view.state.doc.toString();
    view.dispatch(
      current === value ? { effects } : { effects, changes: { from: 0, to: current.length, insert: value } },
    );
  }

  private editableExtensions(readOnly: boolean) {
    return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
  }
}

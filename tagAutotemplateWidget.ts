import { syntaxTree } from "@codemirror/language";
import {
    Extension,
    RangeSetBuilder,
    StateField,
    Transaction,
    EditorState
} from "@codemirror/state";
import {
    Decoration,
    DecorationSet,
    EditorView,
    WidgetType,
} from "@codemirror/view";
import { stat } from "fs";
import TagAutotemplatePlugin from "main";
import * as yaml from 'js-yaml';
import { App, MarkdownPostProcessorContext, MarkdownRenderer, TFile } from "obsidian";
import { autotemplatesStateField } from "autotemplatesStateField";


export class TagAutotemplateWidget extends WidgetType {

    constructor(
        readonly plugin: TagAutotemplatePlugin,
        readonly autotemplates: { tag: string, template: string }[],
        readonly filename: string
    ) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {

        const div = document.createElement("div");
        if (this.autotemplates.length === 0) {
            return div;
        }

        this.plugin.loadFileContents(this.autotemplates.map((t) => t.tag)).then(result => {

            // const tagsInfo = document.createElement("span");
            // tagsInfo.addClass("small");
            // tagsInfo.style.color = "gray";
            // tagsInfo.style.fontSize = "xx-small";
            // tagsInfo.textContent = `Found tags: ${this.autotemplates.map((t) => t.tag).join(", ")}`;
            // div.appendChild(tagsInfo);

            // console.log("markdownToRender ", this.filename, ":\n", result);
            MarkdownRenderer.render(this.plugin.app, result, div, this.filename + ".md", this.plugin).then(result => { });
        })

        // div.style.padding = "4px";
        div.style.width = "100%";
        // div.style.borderColor = "rgba(255, 255, 255, 0.15)";
        // div.style.borderStyle = "solid";
        // div.style.borderRadius = "12px";
        // div.style.borderWidth = "1px";
        // div.style.minHeight = "4px";
        // div.style.lineHeight = "normal";

        div.addEventListener('mousedown', function (event) {
            event.preventDefault();
            event.stopPropagation();
        });

        return div;
    }
}

class TagAutotemplateDecorationWrapper {

    constructor(
        readonly plugin: TagAutotemplatePlugin,
    ) { }

    public lastUsedAutotemplates: { tag: string, template: string }[] = [];

    buildWidget(state: EditorState, oldValue: DecorationSet | null = null): DecorationSet {

        const builder = new RangeSetBuilder<Decoration>();

        let currentAutotemplates = state.field(autotemplatesStateField);
        if (this.lastUsedAutotemplates == currentAutotemplates) {
            // console.log("NO NEED OF RERENDER");

            if (oldValue != null) {
                return oldValue;
            }

            return builder.finish();
        }

        this.lastUsedAutotemplates = currentAutotemplates;

        // console.log("MUST RERENDER");        

        let tree = syntaxTree(state);
        let widgetLocation = 0;

        // console.log("Tree", tree);

        tree.iterate({
            enter(node) {
                if (node.type.name == "def_hmd-frontmatter" && node.node.nextSibling == null) {
                    widgetLocation = node.to + 1;
                }
            }
        })

        let filename = "";
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (activeFile) {
            filename = activeFile.basename; // Получаем имя файла без расширения
        }
        // console.log("Created Widget AT", widgetLocation);
        builder.add(widgetLocation, widgetLocation, Decoration.widget({
            widget: new TagAutotemplateWidget(this.plugin, currentAutotemplates, filename),
            block: true,
            inlineOrder: false
        }));

        return builder.finish();
    }
}

export function tagAutotemplateField(plugin: TagAutotemplatePlugin) {

    let wrapper = new TagAutotemplateDecorationWrapper(plugin);

    return StateField.define<DecorationSet>({

        create(state): DecorationSet {
            return wrapper.buildWidget(state);
        },
        update(oldvalue: DecorationSet, transaction: Transaction): DecorationSet {
            return wrapper.buildWidget(transaction.state, oldvalue);
        },
        provide(field: StateField<DecorationSet>): Extension {
            return EditorView.decorations.from(field);
        },
    })
};

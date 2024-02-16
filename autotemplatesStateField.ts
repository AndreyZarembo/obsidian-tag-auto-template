import {
    StateField,
    Transaction,
    StateEffect
} from "@codemirror/state";

export const autotemplatesStateField = StateField.define<{tag: string, template: string}[]>({

    create() {
        return [];
    },
    update(oldState: {tag: string, template: string}[], transaction: Transaction): {tag: string, template: string}[] {

        let newState = oldState;
        for (let effect of transaction.effects) {
            if (effect.is(setAutotemplatesEffect)) {
                newState = effect.value;
            }
        }

        // console.log("New State Of Tags", newState);

        return newState;
    }
});

export const setAutotemplatesEffect = StateEffect.define<{tag: string, template: string}[]>();

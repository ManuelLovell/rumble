import DiceParser from '@3d-dice/dice-parser-interface'
import { Constants } from './constants';

const noop = () => { }

const defaultNotation = {
    d4: {
        count: 0
    },
    d6: {
        count: 0
    },
    d8: {
        count: 0
    },
    d10: {
        count: 0
    },
    d12: {
        count: 0
    },
    d20: {
        count: 0
    },
    d100: {
        count: 0
    }
}
function deepCopy(obj)
{
    return JSON.parse(JSON.stringify(obj))
}

class DiceUIPicker
{
    baseMessage: string;
    target: HTMLElement;
    elem: DocumentFragment;
    output: HTMLElement | null;
    onSubmit;
    onClear;
    onReroll;
    onResults;

    // create Notation Parser
    DRP = new DiceParser();
    notation = deepCopy(defaultNotation);
    
    constructor(options)
    {
        const mobile = window.innerWidth <  Constants.MOBILEWIDTH;
        this.baseMessage = "Use Buttons to Roll";
        this.target = options.target ? document.querySelector(options.target) : document.body
        this.elem = this.elem = document.createRange().createContextualFragment(`
            <div class="dice-picker">
                <form>
                    <div class="dice${mobile? " center" : ""}">
                        <button class="button-47" value="d4">${mobile ? "4" : "D4"}</button>
                        <button class="button-47" value="d6">${mobile ? "6" : "D6"}</button>
                        <button class="button-47" value="d8">${mobile ? "8" : "D8"}</button>
                        ${mobile ? "</br>" : ""}
                        <button class="button-47" value="d10">${mobile ? "10" : "D10"}</button>
                        <button class="button-47" value="d12">${mobile ? "12" : "D12"}</button>
                        <button class="button-47" value="d20">${mobile ? "20" : "D20"}</button>
                        <button class="button-47" value="d100">${mobile ? "100" : "D100"}</button>
                    </div>
                    <div id="buttonContainer">
                        <button id="resetButton" class="button-47" type="reset">${mobile ? "🚫" : "Clear"}</button>
                        <button id="throwButton" class="button-47"type="submit">${mobile ? "🎲" : "Throw"}</button>
                        <div id="diceNotes" class="output">${this.baseMessage}</div>
                    </div>
                </form>
            </div>
            `)
        // callback events
        this.onSubmit = options?.onSubmit || noop;
        this.onClear = options?.onClear || noop;
        this.onReroll = options?.onReroll || noop;
        this.onResults = options?.onResults || noop;
        this.output = null;
        this.Initialize();
    }

    Initialize()
    {
        this.output = this.elem.querySelector('.output');
        const form = this.elem.querySelector('form')!;
        const buttons = this.elem.querySelectorAll('.dice button') as NodeListOf<HTMLInputElement>;
        buttons.forEach((button) => button.addEventListener("click", (e) =>
        {
            e.preventDefault();
            // build notation
            this.notation[button.value].count += 1;
            this.updateNotation(false);
        }));

        buttons.forEach((button) => button.addEventListener("contextmenu", (e) =>
        {
            e.preventDefault();
            // build notation
            if (this.notation[button.value].count > 0)
            {
                this.notation[button.value].count -= 1;
                this.updateNotation(false);
            }
        }));

        form.addEventListener('submit', (e) =>
        {
            e.preventDefault();
            const notationText = this.output!.innerHTML;
            
            if (notationText == "Use Buttons to Roll") return;

            this.onSubmit(this.DRP.parseNotation(this.output!.innerHTML));
        });

        form.addEventListener('reset', (e) =>
        {
            e.preventDefault();
            this.updateNotation(true);
        });

        this.target.prepend(this.elem);
    }

    public updateNotation(reset: boolean)
    {
        let newNotation = '';
        if (reset)
        {
            this.clear();
            newNotation = this.baseMessage;
        }
        else
        {
            newNotation = Object.entries(this.notation).reduce((prev, [key, val]) =>
            {
                let value: any = val; // Stopping type issue
                let joiner = '';
                if (prev !== '')
                {
                    joiner = ' + ';
                }
                if (value.count === 0)
                {
                    return prev;
                }
                return prev + joiner + value.count + key;
            }, '')
        }

        this.output!.innerHTML = newNotation;
    }

    public setNotation(notation = {})
    {
        this.notation = notation;
        this.updateNotation(false);
    }

    public clear()
    {
        this.notation = deepCopy(defaultNotation);
        this.DRP.clear();
        this.onClear();
    }

    public handleResults(results)
    {

        // convert string names back to intigers needed by DRP
        const diceNotation = /[dD]\d+/i;
        results.forEach(result =>
        {
            if (typeof result.sides === "string" && result.sides.match(diceNotation))
            {
                result.sides = parseInt(result.sides.substring(1));
            }
            result.rolls.forEach(roll =>
            {
                if (typeof roll.sides === "string" && roll.sides.match(diceNotation))
                {
                    roll.sides = parseInt(roll.sides.substring(1));
                }
            })
        })

        const rerolls = this.DRP.handleRerolls(results);
        if (rerolls.length)
        {
            this.onReroll(rerolls);
            return rerolls;
        }

        const finalResults = this.DRP.parsedNotation ? this.DRP.parseFinalResults(results) : results;

        // dispatch an event with the results object for other UI elements to listen for
        const event = new CustomEvent('resultsAvailable', { detail: finalResults });
        document.dispatchEvent(event);

        this.onResults(finalResults);

        return finalResults;
    }

    public ready(): void
    {
        console.log("Dice UI Ready.");
    }

}

export default DiceUIPicker
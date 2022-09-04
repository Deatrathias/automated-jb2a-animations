import { uuidv4 } from "@typhonjs-fvtt/runtime/svelte/util";

import { endTiming } from "../constants/timings.js";
import { AASystemData } from "./getdata-by-system.js";
import { flagMigrations } from "./flagMerge.js";
//import { AutorecFunctions } from "../aa-classes/autorecFunctions.js";
import { AAAutorecFunctions } from "../aa-classes/AAAutorecFunctions.js";

export default class systemData {

    static async make(msg, isChat, external) {
        const systemID = game.system.id.toLowerCase().replace(/[^a-zA-Z0-9 ]/g, "");
        const data = external ? external : AASystemData[systemID] ? await AASystemData[systemID](msg, isChat) : await AASystemData.standardChat(msg)
        if (!data.item) { /*this._log("Retrieval Failed")*/; return {}; }
        //this._log("Data Retrieved", data)

        const flags = await flagMigrations.handle(data.item);

        return new systemData(data, flags, msg);
    }

    constructor(systemData, flagData, msg) {
        this.debug = game.settings.get("autoanimations", "debug");
        this._log("Getting System Data")

        const data = systemData;
        this.gameSystem = game.system.id;

        const midiActive = game.modules.get('midi-qol')?.active;
        this.systemId = game.system.id;
        this.workflow = msg || "";
        this.flags = flagData ?? {};
        this.animation = this.flags.animation || "";

        this.reachCheck = data.reach || 0;
        this.item = data.item;
        this.itemUuid = this.item?.uuid || uuidv4();

        this.hasAttack = this.item?.hasAttack ?? false;
        this.hasDamage = this.item?.hasDamage ?? false;
        this.itemName = this.item.name?.toLowerCase() || this.item.sourceName?.toLowerCase();

        if (this.systemId === 'pf2e') {
            const pf2eRuleTypes = ['condition', 'effect', 'feat'];
            this.isPF2eRuleset = pf2eRuleTypes?.includes(this.item.type);    
        }

        this.isActiveEffect = this.item?.uuid?.includes("ActiveEffect") || this.isPF2eRuleset ? true : false;

        if (this.isActiveEffect) {
            if (this.systemId === 'dnd5e' || this.systemId === 'pf1' || this.systemId === 'wfrp4e' || this.systemId === "sfrpg") {
                this.itemName = this.item.label || "placeholder";
            }
            if (this.systemId === 'pf2e') {
                this.itemName = this.item.name.replace(/[^A-Za-z0-9 .*_-]/g, "");
            }
            this.workflow = "on";
        }

        if (this.workflow === "on") {
            this.workflowBackup = msg || {};
        }

        this.itemMacro = this.item.flags?.itemacro?.macro?.name ?? "";
        this.itemType = this.item.type?.toLowerCase() ?? "";

        this.sourceToken = data.token?.isEmbedded ? data.token?.object : data.token;
        this.actor = data.token?.actor;
        this.allTargets = data.targets;
        this.hitTargets = data.hitTargets;
        this.hitTargetsId = data.hitTargets ? Array.from(this.hitTargets.filter(actor => actor.id).map(actor => actor.id)) : [];
        this.targetsId = Array.from(this.allTargets.filter(actor => actor.id).map(actor => actor.id));

        //midi-qol specific settings
        this.playOnMiss = data.playOnMiss || (midiActive || game.system.id === 'pf2e' ? game.settings.get("autoanimations", "playonmiss") : false) || false;
        //this.playOnMiss = true;
        const midiSettings = midiActive ? game.settings.get("midi-qol", "ConfigSettings") : false
        this._gmAD = midiActive ? midiSettings?.gmAutoDamage : "";
        this._userAD = midiActive ? midiSettings?.autoRollDamage : "";


        this.isDisabled = this.flags.killAnim || false;
        this.isCustomized = this.flags.override || false;

        //changed from flags.animType to match Autorec menu
        this.menu = this.flags.menu || "";

        this.bards = this.flags.bards ?? {};

        this.autorecOverrides = this.flags.autoOverride ?? {};

        this.animNameFinal;
        switch (true) {
            case ((!this.flags.override) || ((this.flags.override) && (this.animation === ``))):
                this.animNameFinal = this.itemName;
                break;
            default:
                this.animNameFinal = this.animation;
                break;
        }
        
        this.animEnd = endTiming(this.animNameFinal);

        //this.autorecSettings = game.settings.get('autoanimations', 'aaAutorec');
        this.autorecSettings = {
            melee: game.settings.get("autoanimations", "aaAutorec-melee"),
            range: game.settings.get("autoanimations", "aaAutorec-range"),
            ontoken: game.settings.get("autoanimations", "aaAutorec-ontoken"),
            templatefx: game.settings.get("autoanimations", "aaAutorec-templatefx"),
            aura: game.settings.get("autoanimations", "aaAutorec-aura"),
            preset: game.settings.get("autoanimations", "aaAutorec-preset"),
            aefx: game.settings.get("autoanimations", "aaAutorec-aefx"),
        }

        this.rinsedName = this.itemName ? AAAutorecFunctions.rinseName(this.itemName) : "noitem";

        //this.isAutorecTemplateItem = AutorecFunctions._autorecNameCheck(AutorecFunctions._getAllNamesInSection(this.autorecSettings, 'templates'), this.rinsedName);
        //this.isAutorecTemplateItem = AAAutorecFunctions.singleMenuSearch(this.autorecSettings.templatefx, this.rinsedName);

        //this.autorecObject = this.isActiveEffect || this.pf2eRuleset ? AutorecFunctions._findObjectIn5eAE(this.autorecSettings, this.rinsedName) : null;
        this.autorecObject = this.isActiveEffect || this.pf2eRuleset ? AAAutorecFunctions.singleMenuSearch(this.autorecSettings.aefx, this.rinsedName) : null;

        if (!this.autorecObject) {
            /* fallback assignment for active effects, default assignment otherwise. */
            this.autorecObject = AAAutorecFunctions.allMenuSearch(this.autorecSettings, this.rinsedName);
        } 
    
        // If there is no match and there are alternative names, then attempt to use those names instead
        if (!this.autorecObject && data.extraNames?.length && !this.isActiveEffect && !this.pf2eRuleset) {
            for (const name of data.extraNames) {
                const rinsedName = AAAutorecFunctions.rinseName(name);
                this.autorecObject = AAAutorecFunctions.allMenuSearch(this.autorecSettings, rinsedName);
                if (this.autorecObject) {
                    this.rinsedName = rinsedName;
                    break;
                }
            }
        }

        /*
        this.isAutorecTemplateItem = false;
        this.isAutorecAura = false;
        this.isAutorecFireball = false;
        this.isAutorecTeleport = false;
        this.isAutoThunderwave5e = false;
        if (this.autorecObject && !this.isCustomized) {
            const menuType = this.autorecObject.aaMenu;
            const presetType = this.autorecObject.presetType;
            this.isAutorecTemplateItem = menuType === 'templatefx' ? true : false;
            this.isAutorecFireball = menuType === "preset" && presetType === "fireball" ? true : false;
            this.isAutorecAura = menuType === "aura" ? true : false;
            this.isAutorecTeleport = menuType === "preset" && presetType === 'teleportation' ? true : false;
            this.isAutoThunderwave5e = menuType === 'preset' && presetType === 'thunderwave' ? true : false;
        }
        this.isAutorecTemplate = (this.isAutorecTemplateItem || this.isAutorecFireball) && !this.isCustomized ? true : false;

        this.isOverrideTemplate = false;
        this.isOverrideTeleport = false;
        this.isOverrideThunderwave5e = false;
        if (this.isCustomized) {
            this.isOverrideTemplate = (this.animType === "templatefx" && this.isCustomized) || (this.animType === "preset" && this.flags.preset?.presetType === "fireball" && this.isCustomized) ? true : false;
            this.isOverrideAura = this.animType === "aura" && this.isCustomized ? true: false;
            this.isOverrideTeleport = (this.animType === "preset" && this.flags.preset?.presetType === "teleportation") || this.isAutorecTeleport ? true : false;
            this.isThunderwave5e = (this.animType === 'preset' && this.isCustomized && this.flags.preset?.presetType === 'thunderwave'); 
        }
        */
        this.decoupleSound = game.settings.get("autoanimations", "decoupleSound");
    }

    get shouldPlayImmediately () {

        if (this.autorecObject || this.isCustomized) {
            const menuType = this.isCustomized ? this.menu : this.autorecObject.menu;
            const presetType = this.isCustomized ? this.flags?.preset?.presetType : this.autorecObject.presetType;

            return menuType === 'templatefx' || menuType === "aura" || (menuType === "preset" && (presetType === "fireball" || presetType === 'teleportation' || presetType === 'thunderwave'))
        } else {
            return false;
        }
        //return this.isOverrideAura || this.isAutorecAura || this.isOverrideTemplate || this.isAutorecTemplate || this.isOverrideTeleport || this.isAutorecTeleport || this.isThunderwave5e || this.isAutoThunderwave5e;
    }

    get isTemplateItem () {
        const menuType = this.isCustomized ? this.menu : this.autorecObject.menu;
        const presetType = this.isCustomized ? this.flags?.preset?.presetType : this.autorecObject.presetType;

        return menuType === 'templatefx' ||  (menuType === 'preset' && presetType === "fireball")
    }

    get soundNoAnimation () {
        return this.flags.audio?.a01?.enable && this.flags.audio?.a01?.file
    }

    get macroOnly () {
        return this.flags.macro?.enable && this.flags.macro?.name
    }

    getDistanceTo(target) {
        if (game.system.id === 'pf1') {
            const scene = game.scenes.active;
            const gridSize = scene.grid.size;

            const left = (token) => token.x;
            const right = (token) => token.x + token.w;
            const top = (token) => token.y;
            const bottom = (token) => token.y + token.h;

            const isLeftOf = right(this.sourceToken) <= left(target);
            const isRightOf = left(this.sourceToken) >= right(target);
            const isAbove = bottom(this.sourceToken) <= top(target);
            const isBelow = top(this.sourceToken) >= bottom(target);

            let x1 = left(this.sourceToken);
            let x2 = left(target);
            let y1 = top(this.sourceToken);
            let y2 = top(target);

            if (isLeftOf) {
                x1 += (this.sourceToken.width - 1) * gridSize;
            }
            else if (isRightOf) {
                x2 += (target.width - 1) * gridSize;
            }

            if (isAbove) {
                y1 += (this.sourceToken.height - 1) * gridSize;
            }
            else if (isBelow) {
                y2 += (target.height - 1) * gridSize;
            }

            const ray = new Ray({ x: x1, y: y1 }, { x: x2, y: y2 });
            const distance = canvas.grid.grid.measureDistances([{ ray }], { gridSpaces: true })[0];
            return distance;
        } else {
            return canvas.grid.measureDistance(this.sourceToken, target, {gridSpaces: true});
        }
    }

    _log(...args) {
        if (this.debug) console.log(`DEBUG | Automated Animations |`, ...args);
    }
}




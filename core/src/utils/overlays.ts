import { config } from '../global/config';
import { getIonMode } from '../global/ionic-global';
import { ActionSheetOptions, AlertOptions, Animation, AnimationBuilder, BackButtonEvent, HTMLIonOverlayElement, IonicConfig, LoadingOptions, ModalOptions, OverlayInterface, PickerOptions, PopoverOptions, ToastOptions } from '../interface';

import { OVERLAY_BACK_BUTTON_PRIORITY } from './hardware-back-button';
import { getElementRoot } from './helpers';

let lastId = 0;

export const activeAnimations = new WeakMap<OverlayInterface, Animation[]>();

const createController = <Opts extends object, HTMLElm extends any>(tagName: string) => {
  return {
    create(options: Opts): Promise<HTMLElm> {
      return createOverlay(tagName, options) as any;
    },
    dismiss(data?: any, role?: string, id?: string) {
      return dismissOverlay(document, data, role, tagName, id);
    },
    async getTop(): Promise<HTMLElm | undefined> {
      return getOverlay(document, tagName) as any;
    }
  };
};

export const alertController = /*@__PURE__*/createController<AlertOptions, HTMLIonAlertElement>('ion-alert');
export const actionSheetController = /*@__PURE__*/createController<ActionSheetOptions, HTMLIonActionSheetElement>('ion-action-sheet');
export const loadingController = /*@__PURE__*/createController<LoadingOptions, HTMLIonLoadingElement>('ion-loading');
export const modalController = /*@__PURE__*/createController<ModalOptions, HTMLIonModalElement>('ion-modal');
export const pickerController = /*@__PURE__*/createController<PickerOptions, HTMLIonPickerElement>('ion-picker');
export const popoverController = /*@__PURE__*/createController<PopoverOptions, HTMLIonPopoverElement>('ion-popover');
export const toastController = /*@__PURE__*/createController<ToastOptions, HTMLIonToastElement>('ion-toast');

export const prepareOverlay = <T extends HTMLIonOverlayElement>(el: T) => {
  const doc = document;
  connectListeners(doc);
  const overlayIndex = lastId++;
  el.overlayIndex = overlayIndex;
  if (!el.hasAttribute('id')) {
    el.id = `ion-overlay-${overlayIndex}`;
  }
};

export const createOverlay = <T extends HTMLIonOverlayElement>(tagName: string, opts: object | undefined): Promise<T> => {
  return customElements.whenDefined(tagName).then(() => {
    const doc = document;
    const element = doc.createElement(tagName) as HTMLIonOverlayElement;
    element.classList.add('overlay-hidden');

    // convert the passed in overlay options into props
    // that get passed down into the new overlay
    Object.assign(element, opts);

    // append the overlay element to the document body
    getAppRoot(doc).appendChild(element);

    return element.componentOnReady() as any;
  });
};

const focusFirstDescendant = (ref: Element) => {
  const firstInput = ref.querySelector('input,button') as HTMLElement | null;
  if (firstInput) {
    firstInput.focus();
  }
};

const focusLastDescendant = (ref: Element) => {
  const inputs = Array.from(ref.querySelectorAll('input,button')) as HTMLElement[];
  const lastInput = inputs.length > 0 && inputs[inputs.length - 1];
  if (lastInput) {
    lastInput.focus();
  }
};

/**
 * Traps keyboard focus inside of overlay components.
 * Based on https://w3c.github.io/aria-practices/examples/dialog-modal/alertdialog.html
 * This includes the following components: Action Sheet, Alert, Loading, Modal,
 * Picker, and Popover.
 * Should NOT include: Toast
 */
const trapKeyboardFocus = (ev: Event, doc: Document) => {
  const lastOverlay = getOverlay(doc) as any;
  const target = ev.target as HTMLElement | null;

  // If no active overlay, ignore this event
  if (!lastOverlay) { return; }

  /**
   * If we are focusing the overlay, clear
   * the last focused element so that hitting
   * tab activates the first focusable element
   * in the overlay wrapper.
   */
  if (lastOverlay === target) {
    lastOverlay.lastFocus = undefined;

    /**
     * Otherwise, we must be focusing an element
     * inside of the overlay. The two possible options
     * here are an input/button/etc or the ion-focus-trap
     * element. The focus trap element is used to prevent
     * the keyboard focus from leaving the overlay when
     * using Tab or screen assistants.
     */
  } else {
    /**
     * We do not want to focus the traps, so get the overlay
     * wrapper element as the traps live outside of the wrapper.
     */
    const overlayRoot = getElementRoot(lastOverlay);
    const overlayWrapper = overlayRoot.querySelector('.ion-overlay-wrapper')!;

    /**
     * If the target is inside the wrapper, let the browser
     * focus as normal and keep a log of the last focused element.
     */
    if (overlayWrapper.contains(target)) {
      lastOverlay.lastFocus = target;
    } else {
      /**
       * Otherwise, we must have focused one of the focus traps.
       * We need to wrap the focus to either the first element
       * or the last element.
       */

      /**
       * Once we call `focusFirstDescendant` and focus the first
       * descendant, another focus event will fire which will
       * cause `lastOverlay.lastFocus` to be updated before
       * we can run the code after that. We will cache the value
       * here to avoid that.
       */
      const lastFocus = lastOverlay.lastFocus;

      // Focus the first element in the overlay wrapper
      focusFirstDescendant(overlayWrapper);

      /**
       * If the cached last focused element is the
       * same as the active element, then we need
       * to wrap focus to the last descendant. This happens
       * when the first descendant is focused, and the user
       * presses Shift + Tab. The previous line will focus
       * the same descendant again (the first one), causing
       * last focus to equal the active element.
       */
      if (lastFocus === doc.activeElement) {
        focusLastDescendant(overlayWrapper);
      }
      lastOverlay.lastFocus = doc.activeElement;
    }
  }
};

export const connectListeners = (doc: Document) => {
  if (lastId === 0) {
    lastId = 1;
    doc.addEventListener('focus', ev => trapKeyboardFocus(ev, doc), true);

    // handle back-button click
    doc.addEventListener('ionBackButton', ev => {
      const lastOverlay = getOverlay(doc);
      if (lastOverlay && lastOverlay.backdropDismiss) {
        (ev as BackButtonEvent).detail.register(OVERLAY_BACK_BUTTON_PRIORITY, () => {
          return lastOverlay.dismiss(undefined, BACKDROP);
        });
      }
    });

    // handle ESC to close overlay
    doc.addEventListener('keyup', ev => {
      if (ev.key === 'Escape') {
        const lastOverlay = getOverlay(doc);
        if (lastOverlay && lastOverlay.backdropDismiss) {
          lastOverlay.dismiss(undefined, BACKDROP);
        }
      }
    });
  }
};

export const dismissOverlay = (doc: Document, data: any, role: string | undefined, overlayTag: string, id?: string): Promise<boolean> => {
  const overlay = getOverlay(doc, overlayTag, id);
  if (!overlay) {
    return Promise.reject('overlay does not exist');
  }
  return overlay.dismiss(data, role);
};

export const getOverlays = (doc: Document, selector?: string): HTMLIonOverlayElement[] => {
  if (selector === undefined) {
    selector = 'ion-alert,ion-action-sheet,ion-loading,ion-modal,ion-picker,ion-popover,ion-toast';
  }
  return (Array.from(doc.querySelectorAll(selector)) as HTMLIonOverlayElement[])
    .filter(c => c.overlayIndex > 0);
};

export const getOverlay = (doc: Document, overlayTag?: string, id?: string): HTMLIonOverlayElement | undefined => {
  const overlays = getOverlays(doc, overlayTag);
  return (id === undefined)
    ? overlays[overlays.length - 1]
    : overlays.find(o => o.id === id);
};

export const present = async (
  overlay: OverlayInterface,
  name: keyof IonicConfig,
  iosEnterAnimation: AnimationBuilder,
  mdEnterAnimation: AnimationBuilder,
  opts?: any
) => {
  if (overlay.presented) {
    return;
  }
  overlay.presented = true;
  overlay.willPresent.emit();

  const mode = getIonMode(overlay);
  // get the user's animation fn if one was provided
  const animationBuilder = (overlay.enterAnimation)
    ? overlay.enterAnimation
    : config.get(name, mode === 'ios' ? iosEnterAnimation : mdEnterAnimation);

  const completed = await overlayAnimation(overlay, animationBuilder, overlay.el, opts);
  if (completed) {
    overlay.didPresent.emit();
  }

  if (overlay.keyboardClose) {
    overlay.el.focus();
  }
};

export const dismiss = async (
  overlay: OverlayInterface,
  data: any | undefined,
  role: string | undefined,
  name: keyof IonicConfig,
  iosLeaveAnimation: AnimationBuilder,
  mdLeaveAnimation: AnimationBuilder,
  opts?: any
): Promise<boolean> => {
  if (!overlay.presented) {
    return false;
  }
  overlay.presented = false;

  try {
    // Overlay contents should not be clickable during dismiss
    overlay.el.style.setProperty('pointer-events', 'none');
    overlay.willDismiss.emit({ data, role });
    const mode = getIonMode(overlay);
    const animationBuilder = (overlay.leaveAnimation)
      ? overlay.leaveAnimation
      : config.get(name, mode === 'ios' ? iosLeaveAnimation : mdLeaveAnimation);

    // If dismissed via gesture, no need to play leaving animation again
    if (role !== 'gesture') {
      await overlayAnimation(overlay, animationBuilder, overlay.el, opts);
    }
    overlay.didDismiss.emit({ data, role });

    activeAnimations.delete(overlay);

  } catch (err) {
    console.error(err);
  }

  overlay.el.remove();
  return true;
};

const getAppRoot = (doc: Document) => {
  return doc.querySelector('ion-app') || doc.body;
};

const overlayAnimation = async (
  overlay: OverlayInterface,
  animationBuilder: AnimationBuilder,
  baseEl: any,
  opts: any
): Promise<boolean> => {
  // Make overlay visible in case it's hidden
  baseEl.classList.remove('overlay-hidden');

  const aniRoot = baseEl.shadowRoot || overlay.el;
  const animation = animationBuilder(aniRoot, opts);

  if (!overlay.animated || !config.getBoolean('animated', true)) {
    animation.duration(0);
  }

  if (overlay.keyboardClose) {
    animation.beforeAddWrite(() => {
      const activeElement = baseEl.ownerDocument!.activeElement as HTMLElement;
      if (activeElement && activeElement.matches('input, ion-input, ion-textarea')) {
        activeElement.blur();
      }
    });
  }

  const activeAni = activeAnimations.get(overlay) || [];
  activeAnimations.set(overlay, [...activeAni, animation]);

  await animation.play();

  return true;
};

export const eventMethod = <T>(element: HTMLElement, eventName: string): Promise<T> => {
  let resolve: (detail: T) => void;
  const promise = new Promise<T>(r => resolve = r);
  onceEvent(element, eventName, (event: any) => {
    resolve(event.detail);
  });
  return promise;
};

export const onceEvent = (element: HTMLElement, eventName: string, callback: (ev: Event) => void) => {
  const handler = (ev: Event) => {
    element.removeEventListener(eventName, handler);
    callback(ev);
  };
  element.addEventListener(eventName, handler);
};

export const isCancel = (role: string | undefined): boolean => {
  return role === 'cancel' || role === BACKDROP;
};

const defaultGate = (h: any) => h();

export const safeCall = (handler: any, arg?: any) => {
  if (typeof handler === 'function') {
    const jmp = config.get('_zoneGate', defaultGate);
    return jmp(() => {
      try {
        return handler(arg);
      } catch (e) {
        console.error(e);
      }
    });
  }
  return undefined;
};

export const BACKDROP = 'backdrop';

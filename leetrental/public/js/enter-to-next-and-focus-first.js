// file: public/js/enter-to-next-and-focus-first.js
(() => {
  if (window.__ENTER_NAV_ACTIVE__) return;
  window.__ENTER_NAV_ACTIVE__ = true;

  function whenFormReady(fn) {
    const iv = setInterval(() => {
      if (window.frappe && frappe.ui && frappe.ui.form && frappe.ui.form.Form) {
        clearInterval(iv);
        fn();
      }
    }, 50);
    setTimeout(() => clearInterval(iv), 10000); // safety stop
  }

  whenFormReady(() => {
    const NON_INPUT_TYPES = new Set([
      "Section Break","Column Break","HTML","Table","Table MultiSelect",
      "Button","Image","Geolocation","Fold","Heading"
    ]);
    const ENTER_SKIP_TYPES = new Set([
      "Text","Small Text","Long Text","Text Editor","Code","HTML Editor","Markdown Editor"
    ]);

    const isFocusableField = (f) =>
      f && f.df && !f.df.hidden && !f.df.read_only &&
      !NON_INPUT_TYPES.has(f.df.fieldtype) &&
      f.$input && f.$input.length && f.$input.is(":visible");

    function focusFirstField(frm) {
      const list = frm.fields.filter(isFocusableField);
      if (list.length) setTimeout(() => list[0].$input.trigger("focus"), 0);
    }

    function focusNextField(frm, currentField) {
      const list = frm.fields.filter(isFocusableField);
      const idx = list.indexOf(currentField);
      for (let i = idx + 1; i < list.length; i++) {
        const t = list[i];
        if (t.$input && t.$input.is(":visible")) {
          t.$input.trigger("focus");
          break;
        }
      }
    }

    // Patch refresh to (a) focus first field and (b) bind one Enter handler per form
    const origRefresh = frappe.ui.form.Form.prototype.refresh;
    frappe.ui.form.Form.prototype.refresh = function (...args) {
      const ret = origRefresh ? origRefresh.apply(this, args) : undefined;
      setTimeout(() => focusFirstField(this), 100);

      if (!this.__enterBound__) {
        this.__enterBound__ = true;

        this.wrapper.addEventListener(
          "keydown",
          (e) => {
            if (e.key !== "Enter") return;

            // Ignore inside grids/child-table editors or textareas
            const $t = window.$ ? $(e.target) : null;
            if ($t && ($t.is("textarea") || $t.closest(".grid-row").length)) return;

            const field = this.fields.find((f) => f.$input && f.$input[0] === e.target);
            if (!field) return;
            if (ENTER_SKIP_TYPES.has(field.df.fieldtype)) return;

            e.preventDefault();
            focusNextField(this, field);
          },
          true
        );
      }

      return ret;
    };

    // Also catch first render path
    const origOnloadPost = frappe.ui.form.Form.prototype.onload_post_render;
    frappe.ui.form.Form.prototype.onload_post_render = function (...args) {
      const ret = origOnloadPost ? origOnloadPost.apply(this, args) : undefined;
      setTimeout(() => focusFirstField(this), 100);
      return ret;
    };
  });
})();

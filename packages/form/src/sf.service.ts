import { Injectable, OnDestroy } from '@angular/core';
import { AlainSFConfig } from '@delon/util/config';
import { deepCopy, LazyService } from '@delon/util/other';
import type Ajv from 'ajv';
import { Observable, Subject } from 'rxjs';
import { SFLayout } from './interface';
import { SFSchema } from './schema';
import { SFOptionalHelp, SFUISchema, SFUISchemaItem, SFUISchemaItemRun } from './schema/ui';
import { retrieveSchema } from './utils';

export type SFServiceNotify = 'loading' | 'refresh';

@Injectable({ providedIn: 'root' })
export class SFService implements OnDestroy {
  private notify$ = new Subject<SFServiceNotify>();
  private status: 'pending' | 'loaded' | null = null;

  get notify(): Observable<SFServiceNotify> {
    return this.notify$.asObservable();
  }

  private get ajv(): Ajv | null {
    const w = window as any;
    return w.ajv2019 || w.ajv7 || w.ajvJTD || w.ajv;
  }

  constructor(private lazySrv: LazyService) {}

  private coverProperty(
    options: AlainSFConfig,
    schema: SFSchema,
    layout: SFLayout,
  ): { schema: SFSchema; ui: SFUISchema; defUi: SFUISchemaItem } {
    const isHorizontal = layout === 'horizontal';
    const { definitions } = schema;

    if (this.ui == null) this.ui = {};
    const defUi: SFUISchemaItem = {
      onlyVisual: options.onlyVisual,
      size: options.size,
      liveValidate: this.liveValidate,
      firstVisual: this.firstVisual,
      ...options.ui,
      ...(schema as any).ui,
      ...this.ui['*'],
    };
    if (this.onlyVisual === true) {
      this._defUi.onlyVisual = true;
    }
    // 内联强制清理 `grid` 参数
    if (layout === 'inline') {
      delete this._defUi.grid;
    }

    // root
    const ui = { ...defUi };

    const inFn = (
      schema: SFSchema,
      _parentSchema: SFSchema,
      uiSchema: SFUISchemaItemRun,
      parentUiSchema: SFUISchemaItemRun,
      uiRes: SFUISchemaItemRun,
    ) => {
      if (!Array.isArray(schema.required)) schema.required = [];

      Object.keys(schema.properties!).forEach(key => {
        const uiKey = `$${key}`;
        const property = retrieveSchema(schema.properties![key] as SFSchema, definitions);
        const ui = {
          widget: property.type,
          ...(property.format && (options.formatMap as any)[property.format]),
          ...(typeof property.ui === 'string' ? { widget: property.ui } : null),
          ...(!property.format && !property.ui && Array.isArray(property.enum) && property.enum.length > 0 ? { widget: 'select' } : null),
          ...this._defUi,
          ...(property.ui as SFUISchemaItem),
          ...uiSchema[uiKey],
        } as SFUISchemaItemRun;
        // 继承父节点布局属性
        if (isHorizontal) {
          if (parentUiSchema.spanLabelFixed) {
            if (!ui.spanLabelFixed) {
              ui.spanLabelFixed = parentUiSchema.spanLabelFixed;
            }
          } else {
            if (!ui.spanLabel) ui.spanLabel = typeof parentUiSchema.spanLabel === 'undefined' ? 5 : parentUiSchema.spanLabel;
            if (!ui.spanControl) ui.spanControl = typeof parentUiSchema.spanControl === 'undefined' ? 19 : parentUiSchema.spanControl;
            if (!ui.offsetControl)
              ui.offsetControl = typeof parentUiSchema.offsetControl === 'undefined' ? null : parentUiSchema.offsetControl;
          }
        } else {
          ui.spanLabel = null;
          ui.spanControl = null;
          ui.offsetControl = null;
        }
        // 内联强制清理 `grid` 参数
        if (layout === 'inline') {
          delete ui.grid;
        }
        // 非水平布局强制清理 `spanLabelFixed` 值
        if (layout !== 'horizontal') {
          ui.spanLabelFixed = null;
        }
        // 当指定标签为固定宽度时无须指定 `spanLabel`，`spanControl`
        if (ui.spanLabelFixed != null && ui.spanLabelFixed > 0) {
          ui.spanLabel = null;
          ui.spanControl = null;
        }
        if (ui.widget === 'date' && ui.end != null) {
          const dateEndProperty = schema.properties![ui.end];
          if (dateEndProperty) {
            dateEndProperty.ui = {
              ...(dateEndProperty.ui as SFUISchemaItem),
              widget: ui.widget,
              hidden: true,
            };
          } else {
            ui.end = null;
          }
        }
        this.inheritUI(ui);
        if (ui.optionalHelp) {
          if (typeof ui.optionalHelp === 'string') {
            ui.optionalHelp = {
              text: ui.optionalHelp,
            } as SFOptionalHelp;
          }
          const oh = (ui.optionalHelp = {
            text: '',
            icon: 'question-circle',
            placement: 'top',
            trigger: 'hover',
            mouseEnterDelay: 0.15,
            mouseLeaveDelay: 0.1,
            ...ui.optionalHelp,
          });
          if (oh.i18n) {
            oh.text = this.fanyi(oh.i18n);
          }
          if (!oh.text) {
            ui.optionalHelp = undefined;
          }
        }
        if (ui.i18n) {
          property.title = this.fanyi(ui.i18n);
        }
        if (ui.descriptionI18n) {
          property.description = this.fanyi(ui.descriptionI18n);
        }
        if (property.description) {
          property._description = this.dom.bypassSecurityTrustHtml(property.description);
        }
        ui.hidden = typeof ui.hidden === 'boolean' ? ui.hidden : false;
        if (ui.hidden === false && ui.acl && this.aclSrv && !this.aclSrv.can(ui.acl)) {
          ui.hidden = true;
        }

        uiRes[uiKey] = ui;
        delete property.ui;

        if (ui.hidden === true) {
          const idx = schema.required!.indexOf(key);
          if (idx !== -1) {
            schema.required!.splice(idx, 1);
          }
        }

        if (property.items) {
          const uiSchemaInArr = (uiSchema[uiKey] || {}).$items || {};
          ui.$items = {
            ...(property.items.ui as SFUISchemaItem),
            ...uiSchemaInArr[uiKey],
            ...ui.$items,
          };
          inFn(property.items, property.items, uiSchemaInArr, ui.$items, ui.$items);
        }

        if (property.properties && Object.keys(property.properties).length) {
          inFn(property, schema, uiSchema[uiKey] || {}, ui, ui);
        }
      });
    };
    inFn(schema, schema, this.ui, this.ui, this._ui);

    // cond
    resolveIfSchema(schema, this._ui);

    delete schema.ui;
    return { schema, defUi };
  }

  cover(o: { options: AlainSFConfig; schema: SFSchema; formData: {}; layout: SFLayout }): void {
    // console.log(this.formPropertyFactory);
    this.coverProperty(o.options, deepCopy(o.schema), o.layout);
    console.log(o);
  }

  refreshSchema(lib: string): void {
    if (this.ajv != null || this.status === 'loaded') {
      this.notify$.next();
      return;
    }
    if (this.status === 'pending') {
      return;
    }

    this.status = 'pending';
    this.lazySrv
      .loadScript(lib)
      .then(() => {
        this.status = 'loaded';
        this.notify$.next();
      })
      .catch(() => {
        throw new Error(`The ajv loaded fail (${lib})`);
      });
  }

  ngOnDestroy(): void {
    this.notify$.unsubscribe();
  }
}

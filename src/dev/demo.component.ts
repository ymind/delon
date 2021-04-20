import { Component } from '@angular/core';
import { SFSchema, SFStringWidgetSchema, SFTextWidgetSchema } from '@delon/form';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-demo',
  template: `
    <h1>Schema 1</h1>
    <sf [schema]="schema" (formSubmit)="submit($event)"></sf>
    <h1>Schema 2</h1>
    <sf [schema]="schema2" (formSubmit)="submit($event)"></sf>
  `,
})
export class DemoComponent {
  schema: SFSchema = {
    properties: {
      id1: { type: 'number', ui: { widget: 'text' } as SFTextWidgetSchema },
      id2: { type: 'number', ui: { widget: 'text', defaultText: 'default text' } as SFTextWidgetSchema },
    },
  };
  schema2: SFSchema = {
    properties: {
      name: {
        type: 'string',
        title: 'Name',
        ui: {
          addOnAfter: 'RMB',
          placeholder: 'RMB结算',
        } as SFStringWidgetSchema,
      },
    },
    required: ['name'],
  };

  constructor(private msg: NzMessageService) {}

  submit(value: {}): void {
    this.msg.info(JSON.stringify(value));
  }
}

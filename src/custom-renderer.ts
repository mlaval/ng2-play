import {
  Renderer,
  RenderTemplateCmd,
  RenderViewWithFragments,
  RenderProtoViewRef,
  RenderViewRef,
  RenderFragmentRef,
  RenderElementRef,
  RenderEventDispatcher,
  RenderCommandVisitor,
  RenderTextCmd,
  RenderBeginElementCmd,
  RenderBeginComponentCmd,
  RenderNgContentCmd,
  RenderEmbeddedTemplateCmd} from 'angular2/angular2';

abstract class Node {
  public parent: Node;
  public children: Node[] = [];
  public attributes: any;

  abstract toMarkdown(): string;
}
class ComponentNode extends Node {
  private contentNodesByNgContentIndex: Node[][] = [];

  constructor(public tag: string, public isBound: boolean, public attributes: any, public isRoot: boolean = false) { super(); }

  addContentNode(ngContentIndex: number, node: Node) {
    while (this.contentNodesByNgContentIndex.length <= ngContentIndex) {
      this.contentNodesByNgContentIndex.push([]);
    }
    this.contentNodesByNgContentIndex[ngContentIndex].push(node);
  }

  project(ngContentIndex: number): Node[] {
    return ngContentIndex < this.contentNodesByNgContentIndex.length ?
        this.contentNodesByNgContentIndex[ngContentIndex] :
        [];
  }

  public toMarkdown(): string {
    var res = '';
    this.children.forEach(child => { res += child.toMarkdown(); });
    return res;
  }
}
class ElementNode extends Node {
  constructor(public tag: string, public isBound: boolean, public attributes: any) { super(); }

  public toMarkdown(): string {
    var start: string = '', end: string = '';
    switch (this.tag) {
      case 'bold': start = end = '**'; break;
      case 'italic': start = end = '*'; break;
      case 'header1': start = end = '#'; break;
      case 'header2': start = end = '##'; break;
      case 'header3': start = end = '###'; break;
      case 'header4': start = end = '####'; break;
      case 'header5': start = end = '#####'; break;
      case 'header6': start = end = '######'; break;
      case 'md-link': start = '['; end = '](' + this.attributes.url + ')'; break;
    }
    var res = start;
    this.children.forEach(child => {
      res += child.toMarkdown();
    });
    res += end;
    return res;
  }
}
class TextNode extends Node {
  constructor(public value: string,  public isBound: boolean) { super(); }

  public toMarkdown(): string { return this.value; }
}
class AnchorNode extends Node {
  constructor() { super(); }

  public toMarkdown(): string { return ''; }
}

class CustomProtoViewRef extends RenderProtoViewRef {
  constructor(public cmds: RenderTemplateCmd[]) { super(); }
}
class CustomRenderFragmentRef extends RenderFragmentRef {
  constructor(public nodes: Node[]) { super(); }
}
class CustomViewRef extends RenderViewRef {
  hydrated: boolean = false;
  constructor(public fragments: CustomRenderFragmentRef[], public boundTextNodes: TextNode[],
              public boundElementNodes: Node[]) { super(); }
}

class CustomRenderViewBuilder implements RenderCommandVisitor {
  private parentStack: Array<Node> = [];
  private rootNodes: Array<Node> = [];

  constructor(public renderer: CustomRenderer, public commands: RenderTemplateCmd[], public parentComponent: ComponentNode, context: BuildContext) {
    if (parentComponent) {
      this.parentStack.push(parentComponent);
    } else {
      context.fragments.push(this.rootNodes);
    }
  }

  build(context: BuildContext) {
    for (var i = 0; i < this.commands.length; i++) {
      this.commands[i].visit(this, context);
    }
  }

  visitText(cmd:RenderTextCmd, context: BuildContext):any {
    console.log('visitText', arguments);
    var text = new TextNode(cmd.value, cmd.isBound);
    this._addChild(text, cmd.ngContentIndex);
    if (cmd.isBound) {
      context.boundTextNodes.push(text);
    }
    return undefined;
  }

  visitNgContent(cmd:RenderNgContentCmd, context: BuildContext):any {
    console.log('visitNgContent', arguments);
    if (this.parentComponent) {
      if (this.parentComponent.isRoot) {
        console.error('TODO: isRoot case in visitNgContent')
      } else {
        var projectedNodes = this.parentComponent.project(cmd.index);
        for (var i = 0; i < projectedNodes.length; i++) {
          var node = projectedNodes[i];
          this._addChild(node, cmd.ngContentIndex);
        }
      }
    }
    return undefined;
  }

  visitBeginElement(cmd: RenderBeginElementCmd, context: BuildContext):any {
    console.log('visitBeginElement', arguments);
    var attributes: any = {};
    for (var i = 0; i < cmd.attrNameAndValues.length / 2; i++) {
      attributes[cmd.attrNameAndValues[i]] = cmd.attrNameAndValues[i+1];
    }
    var element = new ElementNode(cmd.name, cmd.isBound, attributes);
    this._addChild(element, cmd.ngContentIndex);
    this.parentStack.push(element);
    if (cmd.isBound) {
      context.boundElementNodes.push(element);
    }
    return undefined;
  }

  visitEndElement(context: BuildContext):any {
    console.log('visitEndElement', arguments);
    this.parentStack.pop();
    return undefined;
  }

  visitBeginComponent(cmd: RenderBeginComponentCmd, context: BuildContext):any {
    console.log('visitBeginComponent', arguments);
    var attributes: any = {};
    for (var i = 0; i < cmd.attrNameAndValues.length / 2; i++) {
      attributes[cmd.attrNameAndValues[i]] = cmd.attrNameAndValues[i+1];
    }
    var isRoot = context.componentsCount == 0;
    var component = new ComponentNode(cmd.name, cmd.isBound, attributes, isRoot);
    this._addChild(component, cmd.ngContentIndex);
    this.parentStack.push(component);
    if (cmd.isBound) {
      context.boundElementNodes.push(component);
    }
    context.componentsCount++;
    var cptBuilder = new CustomRenderViewBuilder(this.renderer, this.renderer.resolveComponentTemplate(cmd.templateId), component, context);
    context.enqueueBuilder(cptBuilder);
    return undefined;
  }

  visitEndComponent(context: BuildContext):any {
    console.log('visitEndComponent', arguments);
    this.parentStack.pop();
    return undefined;
  }

  visitEmbeddedTemplate(cmd: RenderEmbeddedTemplateCmd, context: BuildContext):any {
    console.log('visitEmbeddedTemplate', arguments);
    var anchor = new AnchorNode();
    this._addChild(anchor, cmd.ngContentIndex);
    context.boundElementNodes.push(anchor);
    if (cmd.isMerged) {
      console.error('TODO: isMerged case in visitEmbeddedTemplate');
    }
    return undefined;
  }

  _addChild(node: Node, ngContentIndex: number) {
    var parent = this.parentStack[this.parentStack.length - 1];
    if (parent) {
      if (ngContentIndex != null && parent instanceof ComponentNode) {
        parent.addContentNode(ngContentIndex, node);
      } else {
        parent.children.push(node);
        node.parent = parent;
      }
    } else {
      if (node instanceof ComponentNode) this.parentComponent = node;
      this.rootNodes.push(node);
    }
  }
}

class BuildContext {
  boundElementNodes: Node[] = [];
  boundTextNodes: TextNode[] = [];
  fragments: Node[][] = [];
  componentsCount: number = 0;
  _builders: CustomRenderViewBuilder[] = [];

  public enqueueBuilder(builder: CustomRenderViewBuilder) {
    this._builders.push(builder);
  }

  public build(builder: CustomRenderViewBuilder) {
    this._builders = [];
    builder.build(this);
    var enqueuedBuilders = this._builders;
    for (var i = 0; i < enqueuedBuilders.length; i++) {
      this.build(enqueuedBuilders[i]);
    }
  }
}

export class CustomRenderer extends Renderer {
  private _componentCmds: Map<number, RenderTemplateCmd[]> = new Map<number, RenderTemplateCmd[]>();
  private _anchor: Element;
  private _rootView: RenderViewWithFragments;

  constructor() {
    super();
    console.log('constructor', arguments);
  }

  createProtoView(cmds:RenderTemplateCmd[]):RenderProtoViewRef {
    console.log('createProtoView', arguments);
    return new CustomProtoViewRef(cmds);
  }

  registerComponentTemplate(templateId:number, commands:RenderTemplateCmd[], styles:string[], nativeShadow:boolean):any {
    console.log('registerComponentTemplate', arguments);
    this._componentCmds.set(templateId, commands);
  }

  resolveComponentTemplate(templateId: number): RenderTemplateCmd[] {
    return this._componentCmds.get(templateId);
  }

  createRootHostView(hostProtoViewRef:RenderProtoViewRef, fragmentCount:number, hostElementSelector:string):RenderViewWithFragments {
    console.log('createRootHostView', arguments);
    var el = document.querySelector(hostElementSelector);
    if (el) {
      this._anchor = el;
      this._rootView = this._createView(hostProtoViewRef);
      return this._rootView;
    } else {
      throw `The selector "${hostElementSelector}" did not match any elements`;
    }
  }

  _refresh() {
    var markdown = (<CustomRenderFragmentRef>this._rootView.fragmentRefs[0]).nodes[0].toMarkdown();
    (<HTMLElement>this._anchor.querySelector('code')).innerText = markdown;
  }

  createView(protoViewRef:RenderProtoViewRef, fragmentCount:number):RenderViewWithFragments {
    console.log('createView', arguments);
    return this._createView(protoViewRef);
  }

  _createView(protoViewRef:RenderProtoViewRef): RenderViewWithFragments {
    console.log('_createView', arguments);
    var context = new BuildContext();
    var builder = new CustomRenderViewBuilder(this, (<CustomProtoViewRef>protoViewRef).cmds, null, context);
    context.build(builder);
    var fragments: CustomRenderFragmentRef[] = [];
    for (var i = 0; i < context.fragments.length; i++) {
      fragments.push(new CustomRenderFragmentRef(context.fragments[i]));
    }
    var view = new CustomViewRef(fragments, context.boundTextNodes, context.boundElementNodes);
    return new RenderViewWithFragments(view, view.fragments);
  }

  destroyView(viewRef:RenderViewRef):any {
    console.error('destroyView', arguments);
    return undefined;
  }

  attachFragmentAfterFragment(previousFragmentRef:RenderFragmentRef, fragmentRef:RenderFragmentRef): void {
    console.log('attachFragmentAfterFragment', arguments);
    var previousNodes = (<CustomRenderFragmentRef>previousFragmentRef).nodes;
    if (previousNodes.length > 0) {
      var sibling = previousNodes[previousNodes.length - 1];
      var nodes = (<CustomRenderFragmentRef>fragmentRef).nodes;
      if (nodes.length > 0 && sibling.parent) {
        for (var i = 0; i < nodes.length; i++) {
          var index = sibling.parent.children.indexOf(sibling);
          sibling.parent.children.splice(index + 1, 0, nodes[i]);
          nodes[i].parent = sibling.parent;
        }
        this._refresh();
      }
    }
  }

  attachFragmentAfterElement(location:RenderElementRef, fragmentRef:RenderFragmentRef): void {
    console.log('attachFragmentAfterElement', arguments);
    var sibling = (<CustomViewRef>location.renderView).boundElementNodes[(<any>location).boundElementIndex];
    var nodes = (<CustomRenderFragmentRef>fragmentRef).nodes;
    if (nodes.length > 0 && sibling.parent) {
      for (var i = 0; i < nodes.length; i++) {
        var index = sibling.parent.children.indexOf(sibling);
        sibling.parent.children.splice(index + 1, 0, nodes[i]);
        nodes[i].parent = sibling.parent;
      }
      this._refresh();
    }
  }

  detachFragment(fragmentRef:RenderFragmentRef): void {
    console.log('detachFragment', arguments);
    var nodes = (<CustomRenderFragmentRef>fragmentRef).nodes;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var index = node.parent.children.indexOf(node);
      node.parent.children.splice(index, 1);
    }
    this._refresh();
  }

  hydrateView(viewRef:RenderViewRef): void {
    console.log('hydrateView', arguments);
    (<CustomViewRef>viewRef).hydrated = true;
  }

  dehydrateView(viewRef:RenderViewRef): void {
    console.log('dehydrateView', arguments);
    (<CustomViewRef>viewRef).hydrated = false;
  }

  getNativeElementSync(location:RenderElementRef):any {
    console.log('getNativeElementSync', arguments);
    return (<CustomViewRef>location.renderView).boundElementNodes[(<any>location).boundElementIndex];
  }

  setElementProperty(location:RenderElementRef, propertyName:string, propertyValue:any): void {
    console.log('setElementProperty', arguments);
    var node = (<CustomViewRef>location.renderView).boundElementNodes[(<any>location).boundElementIndex];
    node.attributes[propertyName] = propertyValue;
    this._refresh();
  }

  setElementAttribute(location:RenderElementRef, attributeName:string, attributeValue:string): void {
    console.log('setElementAttribute', arguments);
    var node = (<CustomViewRef>location.renderView).boundElementNodes[(<any>location).boundElementIndex];
    node.attributes[attributeName] = attributeValue;
    this._refresh();
  }

  setElementClass(location:RenderElementRef, className:string, isAdd:boolean): void {
    console.error('setElementClass', arguments);
  }

  setElementStyle(location:RenderElementRef, styleName:string, styleValue:string): void {
    console.error('setElementStyle', arguments);
  }

  invokeElementMethod(location:RenderElementRef, methodName:string, args:any[]): void {
    console.error('invokeElementMethod', arguments);
  }

  setText(viewRef:RenderViewRef, textNodeIndex:number, text:string): void {
    console.log('setText', arguments);
    (<CustomViewRef>viewRef).boundTextNodes[textNodeIndex].value = text;
    this._refresh();
  }

  setEventDispatcher(viewRef:RenderViewRef, dispatcher:RenderEventDispatcher): void {
    console.log('setEventDispatcher', arguments);
    //Do nothing
  }

}

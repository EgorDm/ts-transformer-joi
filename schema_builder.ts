import _ from "lodash";
import ts from "typescript";


function joiCall(object: ts.Expression, method: string, args?: ts.Expression[]): ts.Expression {
  return ts.createCall(
    ts.createPropertyAccess(object, ts.createIdentifier(method)), undefined, args || []);
}

type JoiValue = string | number | ts.Expression

export class JoiBuilder {
  body: ts.Expression;
  isOptional: boolean;

  constructor(body?: ts.Expression) {
    this.body = body ?? ts.createIdentifier('JoiT');
    this.isOptional = false;
  }

  call(method: string, args?: ts.Expression[]) {
    this.body = joiCall(this.body, method, args);
    return this;
  }

  callParse(method: string, value: JoiValue) {
    if(_.isString(value)) {
      value = ts.createStringLiteral(value);
    } else if (_.isNumber(value)) {
      value = ts.createNumericLiteral(value)
    }
    this.call(method, [value])
    return this;
  }

  any = () => this.call('any');
  boolean = () => this.call('boolean');
  date = () => this.call('date');
  number = () => this.call('number');
  string = () => this.call('string');
  array = () => this.call('array');
  alternatives = () => this.call('alternatives');
  object = (values: Record<string, JoiBuilder>) => this.call('object', [
    ts.createObjectLiteral(
      Object.entries(values)
        .map(([name, prop]) => ts.createPropertyAssignment(ts.createIdentifier(name), prop.build()))
    )
  ])

  try = (joiTypes: JoiBuilder[]) => this.call('try', joiTypes.map((t) => t.build()));

  uuid = () => this.call('uuid');
  uri = () => this.call('uri');

  example = (value: JoiValue) => this.callParse('example', value)
  allow = (value: JoiValue) => this.callParse('allow', value)
  allowNull = () => this.allow(ts.createNull());
  required = () => this.call('required');
  optional = () => {
    this.isOptional = true;
    return this.call('optional');
  }

  valid = (values: ts.Expression[]) => this.call('allow', values)
  items = (joiType: JoiBuilder) => this.call('items', [joiType.optional().build()])

  description = (text: string) => this.callParse('description', text);

  build(): ts.Expression {
    if(!this.isOptional) this.required()
    return this.body;
  }

  static create(): JoiBuilder {
    return new JoiBuilder()
  }
}

export const DEFAULT_UUID = '00000000-0000-0000-0000-000000000000';

const typeCache: Map<string, ts.Expression> = new Map<string, ts.Expression>();

export function joiInferProperty(symbol: ts.Symbol, typeChecker: ts.TypeChecker): JoiBuilder | null {
  const declarations = symbol.declarations;
  if(!declarations || declarations.length === 0) {
    return null;
  }
  const declaration = declarations[0];
  if(!declaration) {
    return null;
  }
  const parent = (declaration as any).parent as ts.InterfaceDeclaration;
  if(!parent) {
    return null;
  }

  const optional = propertyOptional(symbol);
  const description = ((declaration as any).jsDoc || [])[0]?.comment;
  const typeParameters = parent.typeParameters;
  const propertySignature = (declaration as any).type as ts.PropertySignature;

  let joiType: JoiBuilder | null = null;
  if(typeParameters && typeParameters.length > 0) {
    return null;
  } else {
    joiType = joiInferType(propertySignature, typeChecker)
  }
  if(description) joiType?.description(description)
  if(optional) joiType?.optional().allowNull()

  return joiType;
}

function propertyOptional(symbol: ts.Symbol): boolean {
  return !symbol?.declarations?.some(d => (d as ts.PropertySignature).questionToken === undefined);
}

export function joiInferType(
  propertySignature: ts.PropertySignature,
  typeChecker: ts.TypeChecker,
): JoiBuilder {
  const kind = propertySignature.kind as ts.SyntaxKind;
  switch (kind) {
    case ts.SyntaxKind.StringKeyword:
      return JoiBuilder.create().string().allow('')
    case ts.SyntaxKind.NumberKeyword:
      return JoiBuilder.create().number().example(1337)
    case ts.SyntaxKind.BooleanKeyword:
      return JoiBuilder.create().boolean()
    case ts.SyntaxKind.UnknownKeyword:
    case ts.SyntaxKind.AnyKeyword:
      return JoiBuilder.create().any()
    case ts.SyntaxKind.TypeReference: {
      const typeArgs: ts.Node[] = (propertySignature as any).typeArguments;
      if (typeArgs && typeArgs.length > 0) {
        const type = typeChecker.getTypeFromTypeNode(propertySignature as any)
        const properties = typeChecker.getPropertiesOfType(type)

        if(properties) {
          const joiMembers: Record<string, JoiBuilder> = Object.fromEntries(properties
            .map((symbol) => [symbol.name, joiInferProperty(symbol, typeChecker)])
            .filter(([_, prop]) => !!prop))
          return JoiBuilder.create().object(joiMembers)
        } else {
          const typeName = (propertySignature as any).typeName;
          console.error(`JoiSchemaBuilder: Unsupported generic type? ${typeName}`)
          return undefined as any;
        }
      } else {
        const typeName = propertySignature.getText()
        const importSymbol = typeChecker.getSymbolAtLocation((propertySignature as any as ts.TypeReferenceNode).typeName)
        const symbol = importSymbol ? typeChecker.getDeclaredTypeOfSymbol(importSymbol).symbol : null
        const declaration = ((symbol && symbol.declarations) || [])[0];

        if (declaration && ts.isEnumDeclaration(declaration)) {
          return joiInferEnum(declaration, typeChecker)
        } else {
          if(!typeCache.has(typeName)) {
            const refType = joiInferRef(typeName, declaration, typeChecker)
            typeCache.set(typeName, refType.build())
          }
          return new JoiBuilder(typeCache.get(typeName))
        }
      }
    }
    case ts.SyntaxKind.ArrayType: {
      const itemType = joiInferType((<ts.ArrayTypeNode>(propertySignature as any)).elementType as any, typeChecker)
      return JoiBuilder.create().array().items(itemType)
    }
    case ts.SyntaxKind.TypeLiteral: {
      const members: Map<string, ts.Symbol> = (propertySignature as any).symbol.members;
      const joiMembers: Record<string, JoiBuilder> = Object.fromEntries(Array.from(members.entries())
        .map(([name, prop]) => [name, joiInferProperty(prop, typeChecker)])
        .filter(([_, prop]) => !!prop))
      return JoiBuilder.create().object(joiMembers)
    }
    case ts.SyntaxKind.UnionType: {
      const unionType = ((propertySignature as any) as ts.UnionTypeNode);
      const unionLiterals = unionType.types
        .filter(t => isStringLiteral(t, typeChecker))
        .map(t => getLiteralValue(t, typeChecker))
        .filter(t => !!t)
        .map(s => ts.createStringLiteral(s as string))
      const unionTypes = unionType.types
        .filter(t => t.kind !== ts.SyntaxKind.LiteralType)
        .map(t => joiInferType(t as any, typeChecker));

      const union = unionTypes;
      if(unionLiterals && unionLiterals.length > 0) union.push(JoiBuilder.create().string()
        .allow(ts.createSpread(ts.createArrayLiteral(unionLiterals))))

      const result = union.length > 1 ?  JoiBuilder.create().alternatives().try(union) : union[0]
      if (unionType.types.some(t => isNullLiteral(t, typeChecker))) result.allowNull();
      return result;
    }
    default:
      console.error(`JoiSchemaBuilder: Unsupported type?`)
      return undefined as any
  }
}

export function joiInferRef(
  type: string,
  declaration: ts.Declaration,
  typeChecker: ts.TypeChecker
): JoiBuilder {
  switch (type) {
    case 'Date':
      return JoiBuilder.create().date()
        .example(ts.createNew(ts.createIdentifier('Date'), undefined, []))
    case 'UUID':
      return JoiBuilder.create().string().uuid().example(DEFAULT_UUID)
    case 'URL':
    case 'Image':
      return JoiBuilder.create().string().uri().example('http://www.example.com')
    default:
      if(ts.isInterfaceDeclaration(declaration)) {
        return joiInferInterface(declaration, typeChecker)
      } else {
        console.error(`JoiSchemaBuilder: Unknown reference type: ${type}`);
        return undefined as any;
      }
  }
}

export function joiInferEnum(enumDeclaration: ts.EnumDeclaration, typeChecker: ts.TypeChecker): JoiBuilder {
  const values: ts.Expression[] = enumDeclaration.members
    .map(typeChecker.getConstantValue)
    .filter((v) => v !== undefined)
    .map((v) => ts.createStringLiteral(v!.toString()))

  return JoiBuilder.create().string().valid([
    ts.createSpread(ts.createArrayLiteral(values))
  ])
}

export function joiInferInterface(
  interfaceDeclaration: ts.InterfaceDeclaration,
  typeChecker: ts.TypeChecker
): JoiBuilder {
  const members: Record<string, ts.Symbol | undefined> =
    Object.fromEntries(interfaceDeclaration.members.map((prop) => [prop.name?.getText(), (prop as any).symbol]));
  const joiMembers: Record<string, JoiBuilder> = Object.fromEntries(Object.entries(members)
    .map(([name, prop]) => [name, prop ? joiInferProperty(prop, typeChecker) : undefined])
    .filter(([_, prop]) => !!prop))
  return JoiBuilder.create().object(joiMembers)
}

export function isNullLiteral(type: ts.TypeNode, typeChecker: ts.TypeChecker) {
  if(type.kind === ts.SyntaxKind.NullKeyword) return true;
  if(type.kind !== ts.SyntaxKind.LiteralType) return false;
  return getLiteralValue(type, typeChecker) === 'null';
}

export function isStringLiteral(type: ts.TypeNode, typeChecker: ts.TypeChecker) {
  if(type.kind !== ts.SyntaxKind.LiteralType) return false;
  return getLiteralValue(type, typeChecker) !== 'null';
}

export function getLiteralValue(type: ts.TypeNode, typeChecker: ts.TypeChecker): string | undefined {
  const symbol = typeChecker.getTypeFromTypeNode(type)
  return (symbol as any)?.value || (symbol as any)?.intrinsicName;
}

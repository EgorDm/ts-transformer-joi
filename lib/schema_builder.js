"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLiteralValue = exports.isStringLiteral = exports.isNullLiteral = exports.joiInferInterface = exports.joiInferEnum = exports.joiInferRef = exports.joiInferType = exports.joiInferProperty = exports.DEFAULT_UUID = exports.JoiBuilder = void 0;
const lodash_1 = __importDefault(require("lodash"));
const typescript_1 = __importDefault(require("typescript"));
function joiCall(object, method, args) {
    return typescript_1.default.createCall(typescript_1.default.createPropertyAccess(object, typescript_1.default.createIdentifier(method)), undefined, args || []);
}
class JoiBuilder {
    constructor(body) {
        this.any = () => this.call('any');
        this.boolean = () => this.call('boolean');
        this.date = () => this.call('date');
        this.number = () => this.call('number');
        this.string = () => this.call('string');
        this.array = () => this.call('array');
        this.alternatives = () => this.call('alternatives');
        this.object = (values) => this.call('object', [
            typescript_1.default.createObjectLiteral(Object.entries(values)
                .map(([name, prop]) => typescript_1.default.createPropertyAssignment(typescript_1.default.createIdentifier(name), prop.build())))
        ]);
        this.try = (joiTypes) => this.call('try', joiTypes.map((t) => t.build()));
        this.uuid = () => this.call('uuid');
        this.uri = () => this.call('uri');
        this.example = (value) => this.callParse('example', value);
        this.allow = (value) => this.callParse('allow', value);
        this.allowNull = () => this.allow(typescript_1.default.createNull());
        this.required = () => this.call('required');
        this.optional = () => {
            this.isOptional = true;
            return this.call('optional');
        };
        this.valid = (values) => this.call('allow', values);
        this.items = (joiType) => this.call('items', [joiType.optional().build()]);
        this.description = (text) => this.callParse('description', text);
        this.body = body !== null && body !== void 0 ? body : typescript_1.default.createIdentifier('JoiT');
        this.isOptional = false;
    }
    call(method, args) {
        this.body = joiCall(this.body, method, args);
        return this;
    }
    callParse(method, value) {
        if (lodash_1.default.isString(value)) {
            value = typescript_1.default.createStringLiteral(value);
        }
        else if (lodash_1.default.isNumber(value)) {
            value = typescript_1.default.createNumericLiteral(value);
        }
        this.call(method, [value]);
        return this;
    }
    build() {
        if (!this.isOptional)
            this.required();
        return this.body;
    }
    static create() {
        return new JoiBuilder();
    }
}
exports.JoiBuilder = JoiBuilder;
exports.DEFAULT_UUID = '00000000-0000-0000-0000-000000000000';
const typeCache = new Map();
function joiInferProperty(symbol, typeChecker) {
    var _a;
    const declarations = symbol.declarations;
    if (!declarations || declarations.length === 0) {
        return null;
    }
    const declaration = declarations[0];
    if (!declaration) {
        return null;
    }
    const parent = declaration.parent;
    if (!parent) {
        return null;
    }
    const optional = propertyOptional(symbol);
    const description = (_a = (declaration.jsDoc || [])[0]) === null || _a === void 0 ? void 0 : _a.comment;
    const typeParameters = parent.typeParameters;
    const propertySignature = declaration.type;
    let joiType = null;
    if (typeParameters && typeParameters.length > 0) {
        return null;
    }
    else {
        joiType = joiInferType(propertySignature, typeChecker);
    }
    if (description)
        joiType === null || joiType === void 0 ? void 0 : joiType.description(description);
    if (optional)
        joiType === null || joiType === void 0 ? void 0 : joiType.optional().allowNull();
    return joiType;
}
exports.joiInferProperty = joiInferProperty;
function propertyOptional(symbol) {
    var _a;
    return !((_a = symbol === null || symbol === void 0 ? void 0 : symbol.declarations) === null || _a === void 0 ? void 0 : _a.some(d => d.questionToken === undefined));
}
function joiInferType(propertySignature, typeChecker) {
    const kind = propertySignature.kind;
    switch (kind) {
        case typescript_1.default.SyntaxKind.StringKeyword:
            return JoiBuilder.create().string().allow('');
        case typescript_1.default.SyntaxKind.NumberKeyword:
            return JoiBuilder.create().number().example(1337);
        case typescript_1.default.SyntaxKind.BooleanKeyword:
            return JoiBuilder.create().boolean();
        case typescript_1.default.SyntaxKind.UnknownKeyword:
        case typescript_1.default.SyntaxKind.AnyKeyword:
            return JoiBuilder.create().any();
        case typescript_1.default.SyntaxKind.TypeReference: {
            const typeArgs = propertySignature.typeArguments;
            if (typeArgs && typeArgs.length > 0) {
                const type = typeChecker.getTypeFromTypeNode(propertySignature);
                const properties = typeChecker.getPropertiesOfType(type);
                if (properties) {
                    const joiMembers = Object.fromEntries(properties
                        .map((symbol) => [symbol.name, joiInferProperty(symbol, typeChecker)])
                        .filter(([_, prop]) => !!prop));
                    return JoiBuilder.create().object(joiMembers);
                }
                else {
                    const typeName = propertySignature.typeName;
                    console.error(`JoiSchemaBuilder: Unsupported generic type? ${typeName}`);
                    return undefined;
                }
            }
            else {
                const typeName = propertySignature.getText();
                const importSymbol = typeChecker.getSymbolAtLocation(propertySignature.typeName);
                const symbol = importSymbol ? typeChecker.getDeclaredTypeOfSymbol(importSymbol).symbol : null;
                const declaration = ((symbol && symbol.declarations) || [])[0];
                if (declaration && typescript_1.default.isEnumDeclaration(declaration)) {
                    return joiInferEnum(declaration, typeChecker);
                }
                else {
                    if (!typeCache.has(typeName)) {
                        const refType = joiInferRef(typeName, declaration, typeChecker);
                        typeCache.set(typeName, refType.build());
                    }
                    return new JoiBuilder(typeCache.get(typeName));
                }
            }
        }
        case typescript_1.default.SyntaxKind.ArrayType: {
            const itemType = joiInferType(propertySignature.elementType, typeChecker);
            return JoiBuilder.create().array().items(itemType);
        }
        case typescript_1.default.SyntaxKind.TypeLiteral: {
            const members = propertySignature.symbol.members;
            const joiMembers = Object.fromEntries(Array.from(members.entries())
                .map(([name, prop]) => [name, joiInferProperty(prop, typeChecker)])
                .filter(([_, prop]) => !!prop));
            return JoiBuilder.create().object(joiMembers);
        }
        case typescript_1.default.SyntaxKind.UnionType: {
            const unionType = propertySignature;
            const unionLiterals = unionType.types
                .filter(t => isStringLiteral(t, typeChecker))
                .map(t => getLiteralValue(t, typeChecker))
                .filter(t => !!t)
                .map(s => typescript_1.default.createStringLiteral(s));
            const unionTypes = unionType.types
                .filter(t => t.kind !== typescript_1.default.SyntaxKind.LiteralType)
                .map(t => joiInferType(t, typeChecker));
            const union = unionTypes;
            if (unionLiterals && unionLiterals.length > 0)
                union.push(JoiBuilder.create().string()
                    .allow(typescript_1.default.createSpread(typescript_1.default.createArrayLiteral(unionLiterals))));
            const result = union.length > 1 ? JoiBuilder.create().alternatives().try(union) : union[0];
            if (unionType.types.some(t => isNullLiteral(t, typeChecker)))
                result.allowNull();
            return result;
        }
        default:
            console.error(`JoiSchemaBuilder: Unsupported type?`);
            return undefined;
    }
}
exports.joiInferType = joiInferType;
function joiInferRef(type, declaration, typeChecker) {
    switch (type) {
        case 'Date':
            return JoiBuilder.create().date()
                .example(typescript_1.default.createNew(typescript_1.default.createIdentifier('Date'), undefined, []));
        case 'UUID':
            return JoiBuilder.create().string().uuid().example(exports.DEFAULT_UUID);
        case 'URL':
        case 'Image':
            return JoiBuilder.create().string().uri().example('http://www.example.com');
        default:
            if (typescript_1.default.isInterfaceDeclaration(declaration)) {
                return joiInferInterface(declaration, typeChecker);
            }
            else {
                console.error(`JoiSchemaBuilder: Unknown reference type: ${type}`);
                return undefined;
            }
    }
}
exports.joiInferRef = joiInferRef;
function joiInferEnum(enumDeclaration, typeChecker) {
    const values = enumDeclaration.members
        .map(typeChecker.getConstantValue)
        .filter((v) => v !== undefined)
        .map((v) => typescript_1.default.createStringLiteral(v.toString()));
    return JoiBuilder.create().string().valid([
        typescript_1.default.createSpread(typescript_1.default.createArrayLiteral(values))
    ]);
}
exports.joiInferEnum = joiInferEnum;
function joiInferInterface(interfaceDeclaration, typeChecker) {
    const members = Object.fromEntries(interfaceDeclaration.members.map((prop) => { var _a; return [(_a = prop.name) === null || _a === void 0 ? void 0 : _a.getText(), prop.symbol]; }));
    const joiMembers = Object.fromEntries(Object.entries(members)
        .map(([name, prop]) => [name, prop ? joiInferProperty(prop, typeChecker) : undefined])
        .filter(([_, prop]) => !!prop));
    return JoiBuilder.create().object(joiMembers);
}
exports.joiInferInterface = joiInferInterface;
function isNullLiteral(type, typeChecker) {
    if (type.kind === typescript_1.default.SyntaxKind.NullKeyword)
        return true;
    if (type.kind !== typescript_1.default.SyntaxKind.LiteralType)
        return false;
    return getLiteralValue(type, typeChecker) === 'null';
}
exports.isNullLiteral = isNullLiteral;
function isStringLiteral(type, typeChecker) {
    if (type.kind !== typescript_1.default.SyntaxKind.LiteralType)
        return false;
    return getLiteralValue(type, typeChecker) !== 'null';
}
exports.isStringLiteral = isStringLiteral;
function getLiteralValue(type, typeChecker) {
    var _a, _b;
    const symbol = typeChecker.getTypeFromTypeNode(type);
    return ((_a = symbol) === null || _a === void 0 ? void 0 : _a.value) || ((_b = symbol) === null || _b === void 0 ? void 0 : _b.intrinsicName);
}
exports.getLiteralValue = getLiteralValue;
//# sourceMappingURL=schema_builder.js.map
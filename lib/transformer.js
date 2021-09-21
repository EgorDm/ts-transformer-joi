"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_1 = __importDefault(require("typescript"));
const path_1 = __importDefault(require("path"));
const schema_builder_1 = require("./schema_builder");
function transformer(program) {
    return (context) => (file) => {
        if (file.fileName.includes('node_modules')) {
            return file;
        }
        if (file.fileName.endsWith('json')) {
            return file;
        }
        const update = typescript_1.default.updateSourceFileNode(file, [
            typescript_1.default.createImportDeclaration(undefined, undefined, typescript_1.default.createImportClause(undefined, typescript_1.default.createNamespaceImport(typescript_1.default.createIdentifier('JoiT'))), typescript_1.default.createStringLiteral('joi')),
            ...file.statements,
        ]);
        return visitNodeAndChildren(update, program, context);
    };
}
exports.default = transformer;
function visitNodeAndChildren(node, program, context) {
    return typescript_1.default.visitEachChild(visitNode(node, program), childNode => visitNodeAndChildren(childNode, program, context), context);
}
const badInterface = typescript_1.default.createRegularExpressionLiteral(JSON.stringify({
    name: 'never',
    props: []
}));
function visitNode(node, program) {
    const typeChecker = program.getTypeChecker();
    if (!isRuntimeTypeCallExpression(node, typeChecker)) {
        return node;
    }
    if (!node.typeArguments || node.typeArguments.length === 0) {
        console.error('Bad interface');
        return badInterface;
    }
    else {
        const typeNode = node.typeArguments[0];
        const type = typeChecker.getTypeFromTypeNode(typeNode);
        return buildSchema(typeNode.getText(), type, typeChecker);
    }
}
const indexDTs = path_1.default.join(__dirname, 'index.ts');
function isRuntimeTypeCallExpression(node, typeChecker) {
    if (!typescript_1.default.isCallExpression(node)) {
        return false;
    }
    const signature = typeChecker.getResolvedSignature(node);
    if (signature === undefined) {
        return false;
    }
    if (node.expression.getText() === 'joiSchema') {
        return true;
    }
    const { declaration } = signature;
    return (!!declaration &&
        !typescript_1.default.isJSDocSignature(declaration) &&
        path_1.default.join(declaration.getSourceFile().fileName) === indexDTs &&
        !!declaration.name && declaration.name.getText() === 'joiSchema');
}
function buildSchema(name, type, typeChecker) {
    const symbols = typeChecker.getPropertiesOfType(type);
    const props = symbols
        .map(symbol => [symbol.name, buildSchemaProperty(symbol, typeChecker)])
        .filter(([_, expr]) => !!expr)
        .map(([name, expr]) => typescript_1.default.createPropertyAssignment(name, expr));
    return typescript_1.default.createObjectLiteral(props, true);
}
function buildSchemaProperty(symbol, typeChecker) {
    var _a, _b;
    return (_b = (_a = schema_builder_1.joiInferProperty(symbol, typeChecker)) === null || _a === void 0 ? void 0 : _a.build()) !== null && _b !== void 0 ? _b : null;
}
//# sourceMappingURL=transformer.js.map
import ts  from 'typescript';
import path from 'path';
import { joiInferProperty } from "./schema_builder";

export default function transformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => (file: ts.SourceFile) => {
    if(file.fileName.includes('node_modules')) {
      return file;
    }

    const update = ts.updateSourceFileNode(file, [
      ts.createImportDeclaration(
        undefined,
        undefined,
        ts.createImportClause(
          undefined,
          ts.createNamespaceImport(ts.createIdentifier('JoiT'))
        ),
        ts.createStringLiteral('joi')
      ),
      ...file.statements,
    ])
    return visitNodeAndChildren(update, program, context);
  }
}

function visitNodeAndChildren(node: ts.SourceFile, program: ts.Program, context: ts.TransformationContext): ts.SourceFile;
function visitNodeAndChildren(node: ts.Node, program: ts.Program, context: ts.TransformationContext): ts.Node | undefined;
function visitNodeAndChildren(node: ts.Node, program: ts.Program, context: ts.TransformationContext): ts.Node | undefined {
  return ts.visitEachChild(visitNode(node, program), childNode => visitNodeAndChildren(childNode, program, context), context);
}

const badInterface = ts.createRegularExpressionLiteral(
  JSON.stringify({
    name: 'never',
    props: []
  })
)

function visitNode(node: ts.SourceFile, program: ts.Program): ts.SourceFile;
function visitNode(node: ts.Node, program: ts.Program): ts.Node | undefined;
function visitNode(node: ts.Node, program: ts.Program): ts.Node | undefined {
  const typeChecker = program.getTypeChecker();
  if (!isRuntimeTypeCallExpression(node, typeChecker)) {
    return node;
  }

  if (!node.typeArguments || node.typeArguments.length === 0) {
    console.error('Bad interface')
    return badInterface;
  } else {
    const typeNode = node.typeArguments[0];
    const type = typeChecker.getTypeFromTypeNode(typeNode);
    return buildSchema(typeNode.getText(), type, typeChecker);
  }
}

const indexDTs = path.join(__dirname, 'index.ts');

function isRuntimeTypeCallExpression(node: ts.Node, typeChecker: ts.TypeChecker): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const signature = typeChecker.getResolvedSignature(node);
  if (signature === undefined) {
    return false;
  }
  if(node.expression.getText() === 'joiSchema') {
    return true;
  }
  const { declaration } = signature;
  return (
    !!declaration &&
    !ts.isJSDocSignature(declaration) &&
    path.join(declaration.getSourceFile().fileName) === indexDTs &&
    !!declaration.name && declaration.name.getText() === 'joiSchema'
  )
}

function buildSchema(
  name: string,
  type: ts.Type,
  typeChecker: ts.TypeChecker,
): any {
  const symbols = typeChecker.getPropertiesOfType(type);
  const props = symbols
    .map(symbol => [symbol.name, buildSchemaProperty(symbol, typeChecker)])
    .filter(([_, expr]) => !!expr)
    .map(([name, expr]) => ts.createPropertyAssignment(name as string, expr as ts.Expression))

  return ts.createObjectLiteral(props, true)
}

function buildSchemaProperty(symbol: ts.Symbol, typeChecker: ts.TypeChecker): ts.Expression | null {
  return joiInferProperty(symbol, typeChecker)?.build() ?? null
}



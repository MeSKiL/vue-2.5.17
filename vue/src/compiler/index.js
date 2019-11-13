/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
export const createCompiler = createCompilerCreator(function baseCompile ( // 通过柯里化技巧将各个功能都剥离了开来
  template: string,
  options: CompilerOptions
): CompiledResult { // 实际的编译流程，在执行之前，进行了环境判断(有没有new Function)，缓存判断等[createCompileToFunctionFn]。合并配置[compile]等
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    optimize(ast, options) // 优化过程，给静态的dom打static标记
  }
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})

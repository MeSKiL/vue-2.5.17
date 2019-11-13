/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

const { compile, compileToFunctions } = createCompiler(baseOptions) // 其实在create-compiler中返回

export { compile, compileToFunctions }

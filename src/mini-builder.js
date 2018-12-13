const fs = require('fs');
const path = require('path');
const babylon = require('babylon');
const traverse = require('babel-traverse').default;
const { transformFromAst } = require('babel-core');

let identifier = 0;

/**
 * 定义一个创建module的方法， 根据传入的path提取文件的依赖， code等
 * @param {string} path 文件路径
 * @return 模块对象
 */
function createModule(path) {
    const fileContent = fs.readFileSync(path, 'utf-8');

    // 使用babylon生成抽象语法树
    const ast = babylon.parse(fileContent, {
        sourceType: 'module',
    });

    // 用于存储模块的依赖
    const dependencies = [];

    // 提取文件中的依赖，并存到 dependencies 中
    traverse(ast, {
        ImportDeclaration: ({
            node
        }) => {
            dependencies.push(node.source.value);
        },
    });

    // 生成一个唯一的标识符, 用于标识唯一的模块
    const id = identifier++;

    // 使用babel-core 将代码转义成es5的代码
    const { code } = transformFromAst(ast, null, {
        presets: ['env'],
    });

    // 返回一个模块对象，对应这个模块
    return {
        id,
        code,
        dependencies,
        path,
    }
}

/**
 * 定义一个生成依赖树的函数， 遍历每一个被依赖的模块， 提取他们各自的依赖
 * @param {string} entry 入口文件
 * @return 依赖树
 */
function createDependenceTree(entry) {
    // 生成入口模块
    const entryModule = createModule(entry);

    // 定义一个数组作为依赖树的容器，存储模块
    const moduleList = [entryModule];

    // 遍历依赖树，生成完整依赖树
    for (const module of moduleList) {
        module.dependenceMapping = {};
        // 获取模块所在的文件夹路径
        const dirname = path.dirname(module.path);

        module.dependencies.forEach(dependencePath => {
            // 生成依赖的绝对路径
            const absolutePath = path.join(dirname, dependencePath);

            const dependenceModule = createModule(absolutePath);

            // 将模块的依赖的路径和对应的依赖id对应起来，之后加载依赖模块时，找对应id的模块即可
            module.dependenceMapping[dependencePath] = dependenceModule.id;
            moduleList.push(dependenceModule);
        });

    }
    return moduleList;
}

/**
 * 根据依赖树将模块打包，返回一个自执行的函数
 * @param {any[]} dependenceTree 依赖树
 * @return {string} 打包出来的自执行函数，可在浏览器执行
 */
function bundle(dependenceTree) {
    let modules = '';

    /**
     * 遍历依赖树生成一个依赖树对象， key => value类型， key为模块的id， value为一个数组
     * 数组的第一项为一个函数， 传入require, module, exports三个参数， 因为babel转义
     * 出来的模块是CommonJs的， 所以需要给模块提供这个三个参数， 这个需要内部自己实现
     * 是的浏览器能够加载CommonJs的模块.
     * 数组的第二项是依赖模块的路径和依赖id之间的对象关系对象
     */
    dependenceTree.forEach(dependence => {
        modules += `${dependence.id}: [
            function(require, module, exports) {
                ${dependence.code}
            },
            ${JSON.stringify(dependence.dependenceMapping)}
        ],`
    });

    const result = `
    (function(modules) {
      function require(id) {
        const [fn, dependenceMapping] = modules[id];

        function requireModule(name) {
          return require(dependenceMapping[name]);
        }

        const module = { exports : {} };

        fn(requireModule, module, module.exports);

        return module.exports;
      }

      require(0);
    })({${modules}})
  `;
    return result;
}

const graph = createDependenceTree('./example/entry.js');
const result = bundle(graph);

console.log(result);

// (function (modules) {
//     function require(id) {
//         // 自己实现一个 commonjs 的 module 和 module.exports
//         const module = {exports: {}};

//         const fn = modules[id][0];

//         // 得到依赖mappong
//         const dependenceMapping = modules[id][1];

//         // 定义一个函数，执行依赖文件并返回模块的 modules.exports
//         function requireModule(fileName) {
//             return require(dependenceMapping[fileName]);
//         }

//         // 执行模块的内容，传入三个参数
//         fn(requireModule, module, module.exports);
//         return modules.exports;
//     }

//     // 执行入口模块
//     require(0);
// })({${modules}})

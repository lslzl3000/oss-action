
const core = require('@actions/core');
// const github = require('@actions/github');
const OSS = require('ali-oss');
// const fs = require('fs');
const { resolve } = require('path');
const fg = require('fast-glob');

(async () => {
  try {
    let timeout = core.getInput('timeout') 
    timeout = Number(timeout) * 1000
    let parallel = core.getInput('parallel')
    parallel = Number(parallel)
    core.info('[Params]', 'timeout:', timeout, 'parallel:', parallel)
    
    // OSS 实例化
    const opts = {
      accessKeyId: core.getInput('key-id'),
      accessKeySecret: core.getInput('key-secret'),
      bucket: core.getInput('bucket'),
      timeout: timeout
    }

    ;['region', 'endpoint']
      .filter(name => core.getInput(name))
      .forEach(name => {
        Object.assign(opts, {
          [name]: core.getInput(name)
        })
      })

    const oss = new OSS(opts)

    // 上传资源
    const assets = core.getInput('assets', { required: true })

    assets.split('\n').forEach(async rule => {
      const [src, dst] = rule.split(':')

      const files = fg.sync([src], { dot: false, onlyFiles: true })

      if (files.length && !/\/$/.test(dst)) {
        // 单文件
        const res = await oss.multipartUpload(dst, resolve(files[0]), {
          parallel: parallel,
          timeout: timeout,
          progress: (p) => {
            core.info(`[${files[0]}] ${p * 100}%`)
          }
        }).catch(err => {
          core.setFailed(err && err.message)
        })
        core.setOutput('url', res.url)
      } else if (files.length && /\/$/.test(dst)) {
        // 目录
        const res = await Promise.all(
          files.map(async file => {
            const base = src.replace(/\*+$/g, '')
            const filename = file.replace(base, '')
            return oss.multipartUpload(`${dst}${filename}`, resolve(file), {
              parallel: parallel,
              timeout: timeout,
              progress: (p) => {
                core.info(`[${filename}] ${p * 100}%`)
              }
            }).catch(err => {
              core.setFailed(err && err.message)
            })
          })
        )
        core.setOutput('url', res.map(r => r.url).join(','))
      }
    })

  } catch (err) {
    core.setFailed(err.message)
  }
})()

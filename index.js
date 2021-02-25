const { Gauge, Counter } = require('prom-client')

module.exports = {
  register,
  setupPool
}

function register(register, options) {

  const createSingleMetric = createSingleMetricFactory(
    toArray(register),
    generatePrefix(options),
    ['db_name']
  )

  createSingleMetric(Gauge, 'in_use',
    'The number of connections currently in use.')
  createSingleMetric(Counter, 'max_open',
    'Maximum number of open connections to the database.')
  createSingleMetric(Gauge, 'open',
    'The number of established connections both in use and idle.')
  createSingleMetric(Gauge, 'idle',
    'The number of idle connections.')
}

function createSingleMetricFactory(registers, prefix, labelNames) {
  return (Constructor, name, help) => {
    new Constructor({
      registers,
      name: fullMetricName(prefix, name),
      help,
      labelNames
    })
  }
}

function toArray(register) {
  return Array.isArray(register) ? register : [register]
}

function generatePrefix(options = {}) {
  const { namespace, subsystem } = options
  return [namespace, subsystem].filter((value) => value)
}

function setupPool({
  register,
  name,
  pool,
  options
}) {
  const metricMod = metricModder(
    toArray(register),
    generatePrefix(options),
    { db_name: name }
  )

  pool.on('error', (err, client) => {
    debug('postgres', { message: err })
  })
  pool.on('connect', (client) => {
    metricMod('inc', [
      'max_open',
      'open',
      'idle'
    ])
    client.release = _.wrap(client.release, (release) => {
      metricMod('dec', [
        'open',
        'idle'
      ])
      return release()
    })
  })
  pool.on('acquire', (client) => {
    metricMod('inc', [ 'in_use' ])
    metricMod('dec', [ 'idle' ])
  })
  pool.on('remove', (client) => {
    metricMod('inc', [ 'idle' ])
    metricMod('dec', [ 'in_use' ])
  })
}

function metricModder(
  registers, prefix, labels
) {
  return (names, method) => registers.map((register) =>
    names.map((name) =>
      getSingleMetric(register, prefix, name)[method](labels)
    )
  )
}

function getSingleMetric(register, prefix, name) {
  return register.getSingleMetric(fullMetricName(prefix, name))
}

function fullMetricName(prefix, name) {
  return prefix.concat(name).join('_')
}

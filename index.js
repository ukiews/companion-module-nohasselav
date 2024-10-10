// HDP_MXB44VW HDMI MATRIX

let tcp = require('../../tcp')
let instance_skel = require('../../instance_skel')

var debug
var log

class instance extends instance_skel {
	constructor(system, id, config) {
		super(system, id, config)

		this.CHOICES_INPUTS = []
		this.CHOICES_OUTPUTS = []
		this.CHOICES_PRESETS = [
			{ id: '1', label: '1' },
			{ id: '2', label: '2' },
			{ id: '3', label: '3' },
			{ id: '4', label: '4' },
		]
		this.CHOICES_POWER = [
			{ id: '1', label: 'ON' },
			{ id: '0', label: 'OFF' },
		]
		this.CHOICES_STATE = [
			{ id: 'enable', label: 'ENABLE' },
			{ id: 'disable', label: 'DISABLE' },
			{ id: 'toggle', label: 'TOGGLE' },
		]
		this.pollMixerTimer = undefined
		this.selectedInput = 1
		this.outputRoute = {}
		this.outputHDMI = {}
		//this.outputCAT = {}
	}

	destroy() {
		if (this.socket !== undefined) {
			this.socket.destroy()
		}

		if (this.pollMixerTimer !== undefined) {
			clearInterval(this.pollMixerTimer)
			delete this.pollMixerTimer
		}

		debug('destroy', this.id)
	}

	init() {
		debug = this.debug
		log = this.log
		this.updateConfig(this.config)
	}

	updateConfig(config) {
		// polling is running and polling may have been de-selected by config change
		if (this.pollMixerTimer !== undefined) {
			clearInterval(this.pollMixerTimer)
			delete this.pollMixerTimer
		}
		this.config = config

		this.config.polling_interval = this.config.polling_interval !== undefined ? this.config.polling_interval : 750
		this.config.port = this.config.port !== undefined ? this.config.port : 23

		this.initArrays(this.config.channels)
		this.initActions()
		this.initFeedbacks()
		this.initVariables()
		this.init_tcp()
		this.initPolling()
		this.initPresets()
	}

	init_tcp() {
		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.config.host) {
			this.socket = new tcp(this.config.host, this.config.port)

			this.socket.on('status_change', (status, message) => {
				this.status(status, message)
			})

			this.socket.on('error', (err) => {
				debug('Network error', err)
				this.log('error', 'Network error: ' + err.message)
			})

			this.socket.on('connect', () => {
				debug('Connected')
			})

			this.socket.on('data', (receivebuffer) => {
				this.processResponse(receivebuffer)
			})
		}
	}

	processResponse(receivebuffer) {
		if (this.config.log_responses) {
			this.log('info', 'Response: ' + receivebuffer)
		}
		if (this.config.polled_data) {
			let responses = receivebuffer.toString('utf8').split(/[\r\n]+/)
			for (let response of responses) {
				if (response.length > 0) {
					let tokens = response.split(' ')
					if (this.config.log_tokens) {
						this.log('info', 'Tokens: ' + tokens)
					}
					/*
					example poll responses from switch:
					output1->input1 (OLD: input 1 -> output 4)
					output 1 stream: enable (OLD: Enable hdmi output 1 stream)
					(OLD: Disable cat output 4 stream)
					*/
					if (tokens[0] == 'output1->input1') {
						this.updateRoute(tokens[4], tokens[1])
					} else {
						switch (tokens[0]) {
							case 'output':
								this.updateOUTPUT(tokens[1], tokens[3].toLowerCase())
								break
							/*	
							case 'cat':
								this.updateCAT(tokens[3], tokens[0].toLowerCase())
								break
							*/
						}
					}
				}
			}
			this.checkFeedbacks()
		}
	}

	sendCommmand(cmd) {
		if (cmd !== undefined) {
			if (this.socket !== undefined && this.socket.connected) {
				this.socket.send(cmd + '\r\n')
			} else {
				debug('Socket not connected :(')
			}
		}
	}

	initPolling() {
		// read switch state, possible changes using controls on the unit or web interface, 0 for all channels
		if (this.pollMixerTimer === undefined) {
			this.pollMixerTimer = setInterval(() => {
				this.sendCommmand('r output 0 in source!')
				this.sendCommmand('r output 0 stream!')
				//this.sendCommmand('r cat 0 stream!')
			}, this.config.poll_interval)
		}
	}

	updateMatrixVariables() {
		this.CHOICES_INPUTS.forEach((input) => {
			let list = ''
			for (let key in this.outputRoute) {
				if (this.outputRoute[key] == input.id) {
					list += key
				}
			}
			this.setVariable(`input_route${input.id}`, list)
		})
	}

	updateRoute(output, input) {
		this.outputRoute[output] = input
		this.setVariable(`output_route${output}`, input)
		this.updateMatrixVariables()
	}
	/*
	updateCAT(output, stateToggle) {
		if (stateToggle == 'toggle') {
			this.outputCAT[output] == 'disable' ? (stateToggle = 'enable') : (stateToggle = 'disable')
		}
		this.outputCAT[output] = stateToggle
		return stateToggle == 'disable' ? '0' : '1'
	}
 	*/
	updateOUTPUT(output, stateToggle) {
		if (stateToggle == 'toggle') {
			this.outputHDMI[output] == 'disable' ? (stateToggle = 'enable') : (stateToggle = 'disable')
		}
		this.outputHDMI[output] = stateToggle
		return stateToggle == 'disable' ? '0' : '1'
	}

	initArrays(topcount) {
		this.CHOICES_INPUTS = []
		this.CHOICES_OUTPUTS = []
		this.outputRoute = {}
		//this.outputCAT = {}
		this.outputHDMI = {}
		if (topcount > 0) {
			for (let i = 1; i <= topcount; i++) {
				let channelObj = {}
				channelObj.id = i
				channelObj.label = i
				this.CHOICES_INPUTS.push(channelObj)
				this.CHOICES_OUTPUTS.push(channelObj)
				this.outputRoute[i] = i
				//this.outputCAT[i] = 'enable'
				this.outputHDMI[i] = 'enable'
			}
		}
	}

	initVariables() {
		let variables = []
		for (let i = 1; i <= this.config.channels; i++) {
			variables.push({
				label: `Input ${i}`,
				name: `input_route${i}`,
			})
		}
		this.CHOICES_OUTPUTS.forEach((item) => {
			variables.push({
				label: `Output ${item.id}`,
				name: `output_route${item.id}`,
			})
		})
		this.setVariableDefinitions(variables)
		this.CHOICES_OUTPUTS.forEach((output) => {
			this.setVariable(`output_route${output.id}`, this.outputRoute[output.id])
		})
		this.updateMatrixVariables()
	}

	config_fields() {
		return [
			{
				type: 'text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: 'This module will connect to an HDP_MXB44VW HDMI MATRIX',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'IP Address',
				width: 6,
				default: '192.168.0.3',
				regex: this.REGEX_IP,
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'IP Port',
				width: 6,
				default: '23',
				regex: this.REGEX_PORT,
			},
			{
				type: 'dropdown',
				id: 'channels',
				label: 'Number of channels',
				default: '4',
				choices: [
					{ id: '4', label: '4' },
					{ id: '8', label: '8' },
				],
			},
			{
				type: 'number',
				id: 'poll_interval',
				label: 'Polling Interval (ms)',
				min: 300,
				max: 30000,
				default: 1000,
				width: 8,
			},
			{
				type: 'checkbox',
				id: 'polled_data',
				label: 'Use polled data from unit    :',
				default: true,
				width: 8,
			},
			{
				type: 'checkbox',
				id: 'log_responses',
				label: 'Log returned data    :',
				default: false,
				width: 8,
			},
			{
				type: 'checkbox',
				id: 'log_tokens',
				label: 'Log token data    :',
				default: false,
				width: 8,
			},
		]
	}

	initActions() {
		let actions = {
			select_input: {
				label: 'Select Input',
				options: [
					{
						type: 'dropdown',
						label: 'Input Port',
						id: 'input',
						default: '1',
						choices: this.CHOICES_INPUTS,
					},
				],
			},
			switch_output: {
				label: 'Switch Output',
				options: [
					{
						type: 'dropdown',
						label: 'Output Port',
						id: 'output',
						default: '1',
						choices: this.CHOICES_OUTPUTS,
					},
				],
			},
			input_output: {
				label: 'Input to Output',
				options: [
					{
						type: 'dropdown',
						label: 'Output Port',
						id: 'output',
						default: '1',
						choices: this.CHOICES_OUTPUTS,
					},
					{
						type: 'dropdown',
						label: 'Input Port',
						id: 'input',
						default: '1',
						choices: this.CHOICES_INPUTS,
					},
				],
			},
			all: {
				label: 'All outputs to selected input',
				options: [
					{
						type: 'checkbox',
						label: 'Use selected (or defined input)',
						id: 'selected',
						default: false,
					},
					{
						type: 'dropdown',
						label: 'Input Port',
						id: 'input',
						default: '1',
						choices: this.CHOICES_INPUTS,
					},
				],
			},
			preset: {
				label: 'Recall routes from preset number',
				options: [
					{
						type: 'dropdown',
						label: 'Preset number',
						id: 'preset',
						default: '1',
						choices: this.CHOICES_PRESETS,
					},
				],
			},
			save_preset: {
				label: 'Save current routes to preset number',
				options: [
					{
						type: 'dropdown',
						label: 'Preset number',
						id: 'preset',
						default: '1',
						choices: this.CHOICES_PRESETS,
					},
				],
			},
			clear_preset: {
				label: 'Clear preset number',
				options: [
					{
						type: 'dropdown',
						label: 'Preset number',
						id: 'preset',
						default: '1',
						choices: this.CHOICES_PRESETS,
					},
				],
			},
/* 	
			cat_switch: {
				label: 'Enable/Disable CAT output',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						default: '1',
						choices: this.CHOICES_OUTPUTS,
					},
					{
						type: 'dropdown',
						label: 'Enable / Disable / Toggle',
						id: 'stateToggle',
						default: 'on',
						choices: this.CHOICES_STATE,
					},
				],
			},
   */
			output_switch: {
				label: 'Enable/Disable HDMI output',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						default: '1',
						choices: this.CHOICES_OUTPUTS,
					},
					{
						type: 'dropdown',
						label: 'Enable / Disable / Toggle',
						id: 'stateToggle',
						default: 'on',
						choices: this.CHOICES_STATE,
					},
				],
			},
			power: {
				label: 'Power control',
				options: [
					{
						type: 'dropdown',
						label: 'Power control',
						id: 'power',
						default: 'ON',
						choices: this.CHOICES_POWER,
					},
				],
			},
		}
		this.setActions(actions)
	}

	action(action) {
		let options = action.options
		switch (action.action) {
			case 'select_input':
				this.selectedInput = options.input
				break
			case 'switch_output':
				this.sendCommmand('s output ' + options.output + ' in source ' + this.selectedInput + '!')
				this.updateRoute(options.output, this.selectedInput)
				break
			case 'input_output':
				this.sendCommmand('s output ' + options.output + ' in source ' + options.input + '!')
				this.updateRoute(options.output, options.input)
				break
			case 'all':
				let myInput = this.selectedInput
				if (!options.selected) {
					myInput = options.input
				}
				this.sendCommmand('s output 0 in source ' + myInput + '!')
				for (let key in this.outputRoute) {
					if (key <= this.config.channels) {
						this.updateRoute(key, myInput)
					}
				}
				break
			case 'preset':
				this.sendCommmand('s recall preset ' + options.preset + '!')
				break
			case 'save_preset':
				this.sendCommmand('s save preset ' + options.preset + '!')
				break
			case 'clear_preset':
				this.sendCommmand('s clear preset ' + options.preset + '!')
				break
		/*	
			case 'cat_switch':
				this.sendCommmand(
					's cat ' + options.output + ' stream ' + this.updateCAT(options.output, options.stateToggle) + '!'
				)
				break
    */
			case 'output_switch':
				this.sendCommmand(
					's output ' + options.output + ' stream ' + this.updateOUTPUT(options.output, options.stateToggle) + '!'
				)
				break
			case 'power':
				this.sendCommmand('s power ' + options.power + '!')
				break
		} // note that internal status values are set immediately for feedback responsiveness and will be updated gain when the unit reponds (hopefully with the same value!)
		this.checkFeedbacks()
	}

	initFeedbacks() {
		let feedbacks = {}

		feedbacks['selected'] = {
			type: 'boolean',
			label: 'Status for input',
			description: 'Show feedback selected input',
			options: [
				{
					type: 'dropdown',
					label: 'Input',
					id: 'input',
					default: '1',
					choices: this.CHOICES_INPUTS,
				},
			],
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(255, 0, 0),
			},
			callback: (feedback, bank) => {
				let opt = feedback.options
				if (this.selectedInput == opt.input) {
					return true
				} else {
					return false
				}
			},
		}
		feedbacks['output'] = {
			type: 'boolean',
			label: 'Status for output',
			description: 'Show feedback selected output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: '1',
					choices: this.CHOICES_OUTPUTS,
				},
			],
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(0, 255, 0),
			},
			callback: (feedback, bank) => {
				let opt = feedback.options
				if (this.outputRoute[opt.output] == this.selectedInput) {
					return true
				} else {
					return false
				}
			},
		}
		feedbacks['stateHDMI'] = {
			type: 'boolean',
			label: 'State for HDMI output',
			description: 'Enable state for HDMI output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: '1',
					choices: this.CHOICES_OUTPUTS,
				},
			],
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(255, 0, 0),
			},
			callback: (feedback, bank) => {
				let opt = feedback.options
				if (this.outputHDMI[opt.output] == 'disable') {
					return true
				} else {
					return false
				}
			},
		}
		/*
		feedbacks['stateCAT'] = {
			type: 'boolean',
			label: 'State for CAT output',
			description: 'Enable state for CAT output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: '1',
					choices: this.CHOICES_OUTPUTS,
				},
			],
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(255, 0, 0),
			},
			callback: (feedback, bank) => {
				let opt = feedback.options
				if (this.outputCAT[opt.output] == 'disable') {
					return true
				} else {
					return false
				}
			},
		}
  		*/
		this.setFeedbackDefinitions(feedbacks)
		this.checkFeedbacks()
	}
	initPresets() {
		let presets = []

		const aSelectPreset = (input) => {
			return {
				category: 'Select Input',
				label: 'Select',
				bank: {
					style: 'text',
					text: `In ${input}\\n> $(${this.config.label}:input_route${input})`,
					size: 'auto',
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 0),
				},
				actions: [
					{
						action: 'select_input',
						options: {
							input: input,
						},
					},
				],
				feedbacks: [
					{
						type: 'selected',
						options: {
							input: input,
						},
						style: {
							color: this.rgb(0, 0, 0),
							bgcolor: this.rgb(255, 0, 0),
						},
					},
				],
			}
		}
		const aSwitchPreset = (output) => {
			return {
				category: 'Switch Output',
				label: 'Switch',
				bank: {
					style: 'text',
					text: `Out ${output}\\n< $(${this.config.label}:output_route${output})`,
					size: 'auto',
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 0),
				},
				actions: [
					{
						action: 'switch_output',
						options: {
							output: output,
						},
					},
				],
				feedbacks: [
					{
						type: 'output',
						options: {
							output: output,
						},
						style: {
							color: this.rgb(0, 0, 0),
							bgcolor: this.rgb(0, 255, 0),
						},
					},
				],
			}
		}
		/*
		const aCATPreset = (output) => {
			return {
				category: 'stateCAT',
				label: 'State of CAT output',
				bank: {
					style: 'text',
					text: `CAT Out ${output}`,
					size: 'auto',
					color: this.rgb(0, 0, 0),
					bgcolor: this.rgb(0, 255, 0),
				},
				actions: [
					{
						action: 'cat_switch',
						options: {
							output: output,
							stateToggle: 'toggle',
						},
					},
				],
				feedbacks: [
					{
						type: 'stateCAT',
						options: {
							output: output,
						},
						style: {
							color: this.rgb(0, 0, 0),
							bgcolor: this.rgb(255, 0, 0),
						},
					},
				],
			}
		}
		*/
		const aHDMIPreset = (output) => {
			return {
				category: 'stateHDMI',
				label: 'State of HDMI output',
				bank: {
					style: 'text',
					text: `HDMI Out ${output}`,
					size: 'auto',
					color: this.rgb(0, 0, 0),
					bgcolor: this.rgb(0, 255, 0),
				},
				actions: [
					{
						action: 'output_switch',
						options: {
							output: output,
							stateToggle: 'toggle',
						},
					},
				],
				feedbacks: [
					{
						type: 'stateHDMI',
						options: {
							output: output,
						},
						style: {
							color: this.rgb(0, 0, 0),
							bgcolor: this.rgb(255, 0, 0),
						},
					},
				],
			}
		}
		const anAllPreset = (input) => {
			return {
				category: 'All',
				label: 'All',
				bank: {
					style: 'text',
					text: `All\\n${input}`,
					size: '18',
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(32, 0, 0),
				},
				actions: [
					{
						action: 'all',
						options: {
							selected: false,
							input: input,
						},
					},
				],
			}
		}

		this.CHOICES_INPUTS.forEach((input) => {
			presets.push(aSelectPreset(input.id))
		})
		this.CHOICES_OUTPUTS.forEach((output) => {
			presets.push(aSwitchPreset(output.id))
		})
		/*
		this.CHOICES_OUTPUTS.forEach((output) => {
			presets.push(aCATPreset(output.id))
		})
  		*/
		this.CHOICES_OUTPUTS.forEach((output) => {
			presets.push(aHDMIPreset(output.id))
		})
		this.CHOICES_INPUTS.forEach((input) => {
			presets.push(anAllPreset(input.id))
		})

		presets.push({
			category: 'In to Out',
			label: 'In to Out',
			bank: {
				style: 'text',
				text: 'In to Out',
				size: 'auto',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'input_output',
					options: {
						input: '1',
						output: '1',
						select: false,
					},
				},
			],
		})

		this.setPresetDefinitions(presets)
	}
}
exports = module.exports = instance

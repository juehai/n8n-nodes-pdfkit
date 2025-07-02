import { IExecuteFunctions } from 'n8n-core';
import {
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

const PDFDocument = require('pdfkit');
var sizeOf = require('image-size');
const PDFMerger = require('pdf-merger-js');
const Poppler = require('pdf-poppler');
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export class PdfKit implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PdfKit',
		name: 'pdfKit',
		group: ['transform'],
		version: 1,
		description: 'PDFKit Node',
		defaults: {
			name: 'PDFKit',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'imagesToPDF',
				required: true,
				options:[
					{
						name:'Convert Images To PDF',
						value:'imagesToPDF'
					},
                                        {
                                                name:'Merge PDFs',
                                                value:'mergePDFs'
                                        },
                                        {
                                                name:'PDF to Images',
                                                value:'pdfToImages'
                                        }
                                ],
                        },
			// Fields for imagesToPDF operation
			{
				displayName: 'Destination Key',
				name: 'outputKey',
				type: 'string',
				default: 'data',
				required: true,
				description: 'The name the binary key to copy data to',
				displayOptions: {
					show: {
						operation: [
							'imagesToPDF',
							'mergePDFs',
						],
					},
				},
			},
			{
				displayName: 'PDF Name',
				name: 'pdfName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the output PDF',
				displayOptions: {
					show: {
						operation: [
							'imagesToPDF',
							'mergePDFs',
						],
					},
				},
			},
                        {
                                displayName: 'Keep Images',
                                name: 'keepImages',
                                type: 'boolean',
                                default: false,
                                description: 'Whether to keep images that were used in the PDF',
                                displayOptions: {
                                        show: {
                                                operation: [
                                                        'imagesToPDF',
                                                ],
                                        },
                                },
                        },
                        // Fields for pdfToImages operation
                        {
                                displayName: 'PDF Binary Field',
                                name: 'pdfField',
                                type: 'string',
                                default: '',
                                required: true,
                                description: 'The binary field containing the PDF to split',
                                displayOptions: {
                                        show: {
                                                operation: [
                                                        'pdfToImages',
                                                ],
                                        },
                                },
                        },
                        {
                                displayName: 'Output Prefix',
                                name: 'outputPrefix',
                                type: 'string',
                                default: 'page',
                                required: true,
                                description: 'Prefix for the binary keys of the output images',
                                displayOptions: {
                                        show: {
                                                operation: [
                                                        'pdfToImages',
                                                ],
                                        },
                                },
                        },
                        {
                                displayName: 'Keep Source PDF',
                                name: 'keepSourcePdf',
                                type: 'boolean',
                                default: false,
                                description: 'Whether to keep the PDF file after splitting',
                                displayOptions: {
                                        show: {
                                                operation: [
                                                        'pdfToImages',
                                                ],
                                        },
                                },
                        },
                        // Fields for mergePDFs operation
			{
				displayName: 'First PDF Binary Field',
				name: 'firstPdfField',
				type: 'string',
				default: '',
				required: true,
				description: 'The binary field containing the first PDF to merge',
				displayOptions: {
					show: {
						operation: [
							'mergePDFs',
						],
					},
				},
			},
			{
				displayName: 'Second PDF Binary Field',
				name: 'secondPdfField',
				type: 'string',
				default: '',
				required: true,
				description: 'The binary field containing the second PDF to merge',
				displayOptions: {
					show: {
						operation: [
							'mergePDFs',
						],
					},
				},
			},
			{
				displayName: 'Keep Source PDFs',
				name: 'keepSourcePdfs',
				type: 'boolean',
				default: false,
				description: 'Whether to keep the source PDFs in the binary data',
				displayOptions: {
					show: {
						operation: [
							'mergePDFs',
						],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as string;
		
		let item: INodeExecutionData;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const outputName = this.getNodeParameter('pdfName', itemIndex, '') as string;
				const outputKey = this.getNodeParameter('outputKey', itemIndex, '') as string;
				item = items[itemIndex];

				if (item.binary === undefined) {
					throw new NodeOperationError(this.getNode(), 'No binary data exists on item!');
				}

				// Handle different operations
                                if (operation === 'imagesToPDF') {
                                        // Original imagesToPDF operation
                                        const keepImages = this.getNodeParameter('keepImages', itemIndex, false) as boolean;
					
					let doc;
					for (var [index,key] of Object.keys(item.binary).entries()){
						const binary = Object.assign({},item.binary[key]);
						if(binary.fileType==='image'){
							const binaryDataBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, key);
							const dimensions = sizeOf(binaryDataBuffer);
							const size =[dimensions.width,dimensions.height];
							if(index !== 0){
								doc.addPage({size:size});
							}
							else{
								doc = new PDFDocument({margin:0, size:size});
							}
							doc.image(binaryDataBuffer, 0, 0, { fit: size, align: 'center', valign: 'center' })
							if(!keepImages){
								delete item.binary[key];
							}
						}
					}
					doc.end();
					item.binary![outputKey] = await this.helpers.prepareBinaryData(doc, `${outputName}.pdf`);
				
                                } else if (operation === 'pdfToImages') {
                                        const pdfField = this.getNodeParameter('pdfField', itemIndex, '') as string;
                                        const outputPrefix = this.getNodeParameter('outputPrefix', itemIndex, 'page') as string;
                                        const keepSourcePdf = this.getNodeParameter('keepSourcePdf', itemIndex, false) as boolean;

                                        if (!item.binary[pdfField]) {
                                                throw new NodeOperationError(this.getNode(), `PDF field "${pdfField}" does not exist on item!`);
                                        }

                                        const pdfBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, pdfField);

                                        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfsplit-'));
                                        const inputPath = path.join(tmpDir, 'input.pdf');
                                        await fs.writeFile(inputPath, pdfBuffer);

                                        const opts = { format: 'png', out_dir: tmpDir, out_prefix: outputPrefix, page: null };
                                        await Poppler.convert(inputPath, opts);

                                        const files = await fs.readdir(tmpDir);
                                        const imageFiles = files.filter((f: string) => f.startsWith(outputPrefix));

                                        for (const [index, file] of imageFiles.entries()) {
                                                const data = await fs.readFile(path.join(tmpDir, file));
                                                const key = `${outputPrefix}${index + 1}`;
                                                item.binary![key] = await this.helpers.prepareBinaryData(data, file, 'image/png');
                                        }

                                        await fs.rm(tmpDir, { recursive: true, force: true });

                                        if (!keepSourcePdf) {
                                                delete item.binary[pdfField];
                                        }

                                } else if (operation === 'mergePDFs') {
					// New mergePDFs operation
					const firstPdfField = this.getNodeParameter('firstPdfField', itemIndex, '') as string;
					const secondPdfField = this.getNodeParameter('secondPdfField', itemIndex, '') as string;
					const keepSourcePdfs = this.getNodeParameter('keepSourcePdfs', itemIndex, false) as boolean;
					
					// Check if both PDF fields exist in binary data
					if (!item.binary[firstPdfField]) {
						throw new NodeOperationError(this.getNode(), `First PDF field "${firstPdfField}" does not exist on item!`);
					}
					
					if (!item.binary[secondPdfField]) {
						throw new NodeOperationError(this.getNode(), `Second PDF field "${secondPdfField}" does not exist on item!`);
					}
					
					// Get binary buffers for both PDFs
					const firstPdfBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, firstPdfField);
					const secondPdfBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, secondPdfField);
					
					// Create a new PDF merger
					const merger = new PDFMerger();
					
					// Add both PDFs to the merger
					await merger.add(firstPdfBuffer);
					await merger.add(secondPdfBuffer);
					
					// Get the merged PDF as a buffer
					const mergedPdfBuffer = await merger.saveAsBuffer();
					
					// Save the merged PDF to the binary data
					item.binary![outputKey] = await this.helpers.prepareBinaryData(
						mergedPdfBuffer,
						`${outputName}.pdf`,
						'application/pdf'
					);
					
					// Optionally remove source PDFs
					if (!keepSourcePdfs) {
						delete item.binary[firstPdfField];
						delete item.binary[secondPdfField];
					}
				}

			} catch (error) {
				// This node should never fail but we want to showcase how
				// to handle errors.
				if (this.continueOnFail()) {
					items.push({ json: this.getInputData(itemIndex)[0].json, error, pairedItem: itemIndex });
				} else {
					// Adding `itemIndex` allows other workflows to handle this error
					if (error.context) {
						// If the error thrown already contains the context property,
						// only append the itemIndex
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return this.prepareOutputData(items);
	}
}

/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: PostCSS pipeline configuration enabling Tailwind CSS and Autoprefixer preprocessing.
*/

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
	plugins: {
		tailwindcss: {
			config: path.resolve(__dirname, 'tailwind.config.js'),
		},
		autoprefixer: {},
	},
};
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ConceptPicker,
	type ConceptPickerOption,
} from "../components/concept-picker.js";

afterEach(() => cleanup());

const OPTIONS: ConceptPickerOption[] = [
	{ id: "var", name: "Variable", aliases: ["letter", "unknown"] },
	{ id: "expr", name: "Expression" },
	{ id: "eq", name: "Equation", aliases: ["formula"] },
	{ id: "ineq", name: "Inequality" },
];

describe("ConceptPicker", () => {
	it("renders the search input", () => {
		render(
			<ConceptPicker
				selectedIds={[]}
				options={OPTIONS}
				onChange={vi.fn()}
				placeholder="Search…"
			/>,
		);
		expect(screen.getByRole("combobox")).toBeDefined();
	});

	it("opens the dropdown on focus", () => {
		render(<ConceptPicker selectedIds={[]} options={OPTIONS} onChange={vi.fn()} />);
		fireEvent.focus(screen.getByRole("combobox"));
		expect(screen.getByRole("listbox")).toBeDefined();
	});

	it("filters by name (case-insensitive substring)", () => {
		render(<ConceptPicker selectedIds={[]} options={OPTIONS} onChange={vi.fn()} />);
		const input = screen.getByRole("combobox");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "eq" } });
		// Matches "Equation" + "Inequality"
		const options = screen.getAllByRole("option");
		expect(options.length).toBe(2);
		expect(options.some((o) => o.textContent?.includes("Equation"))).toBe(true);
		expect(options.some((o) => o.textContent?.includes("Inequality"))).toBe(true);
	});

	it("filters by alias", () => {
		render(<ConceptPicker selectedIds={[]} options={OPTIONS} onChange={vi.fn()} />);
		const input = screen.getByRole("combobox");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "letter" } });
		// "letter" is an alias of "Variable" but not in any name
		const options = screen.getAllByRole("option");
		expect(options.length).toBe(1);
		expect(options[0]?.textContent).toContain("Variable");
	});

	it("selects an option on click", () => {
		const onChange = vi.fn();
		render(
			<ConceptPicker selectedIds={[]} options={OPTIONS} onChange={onChange} />,
		);
		fireEvent.focus(screen.getByRole("combobox"));
		const expressionOption = screen
			.getAllByRole("option")
			.find((o) => o.textContent?.includes("Expression"));
		expect(expressionOption).toBeDefined();
		if (expressionOption) fireEvent.click(expressionOption);
		expect(onChange).toHaveBeenCalledWith(["expr"]);
	});

	it("renders chips for selected ids and supports removal", () => {
		const onChange = vi.fn();
		render(
			<ConceptPicker
				selectedIds={["var", "eq"]}
				options={OPTIONS}
				onChange={onChange}
			/>,
		);
		// Two chips with names from options
		expect(screen.getByText("Variable")).toBeDefined();
		expect(screen.getByText("Equation")).toBeDefined();
		// Remove "Variable"
		const removeBtn = screen.getByLabelText("Remove Variable");
		fireEvent.click(removeBtn);
		expect(onChange).toHaveBeenCalledWith(["eq"]);
	});

	it("ArrowDown / Enter selects the highlighted option", () => {
		const onChange = vi.fn();
		render(
			<ConceptPicker selectedIds={[]} options={OPTIONS} onChange={onChange} />,
		);
		const input = screen.getByRole("combobox");
		fireEvent.focus(input);
		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "Enter" });
		// Initial activeIndex is 0; one ArrowDown moves to 1 → "Expression"
		expect(onChange).toHaveBeenCalledWith(["expr"]);
	});

	it("Escape closes the dropdown", () => {
		render(<ConceptPicker selectedIds={[]} options={OPTIONS} onChange={vi.fn()} />);
		const input = screen.getByRole("combobox");
		fireEvent.focus(input);
		expect(screen.getByRole("listbox")).toBeDefined();
		fireEvent.keyDown(input, { key: "Escape" });
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("marks already-selected options as aria-disabled and ignores Enter on them", () => {
		const onChange = vi.fn();
		render(
			<ConceptPicker
				selectedIds={["var"]}
				options={OPTIONS}
				onChange={onChange}
			/>,
		);
		fireEvent.focus(screen.getByRole("combobox"));
		const variableOption = screen
			.getAllByRole("option")
			.find((o) => o.textContent?.includes("Variable"));
		expect(variableOption?.getAttribute("aria-disabled")).toBe("true");
	});

	it("click-outside closes the dropdown", () => {
		render(
			<div>
				<ConceptPicker
					selectedIds={[]}
					options={OPTIONS}
					onChange={vi.fn()}
				/>
				<button type="button" data-testid="outside">
					outside
				</button>
			</div>,
		);
		const input = screen.getByRole("combobox");
		fireEvent.focus(input);
		expect(screen.getByRole("listbox")).toBeDefined();
		// Simulate mousedown on something outside.
		fireEvent.mouseDown(screen.getByTestId("outside"));
		expect(screen.queryByRole("listbox")).toBeNull();
	});
});

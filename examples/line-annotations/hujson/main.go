// Convert human-edited example assets to standard JSON on stdin/stdout.
package main

import (
	"fmt"
	"io"
	"os"

	"github.com/tailscale/hujson"
)

func main() {
	input, err := io.ReadAll(os.Stdin)
	if err == nil {
		input, err = hujson.Standardize(input)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if _, err = os.Stdout.Write(input); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
